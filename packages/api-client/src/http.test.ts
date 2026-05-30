import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiClientError, createRestClient } from './http'

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

const base = 'http://localhost:4010/api/v1'

describe('createRestClient request', () => {
  it('builds the URL with query params and parses with the schema', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: '1' }]))
    const client = createRestClient({ baseUrl: base, fetch })

    const result = await client.get('/entity-records', {
      schema: z.array(z.object({ id: z.string() })),
      query: { entityTypeId: 'et-1', empty: undefined },
    })

    expect(fetch.mock.calls[0][0]).toBe(`${base}/entity-records?entityTypeId=et-1`)
    expect(result).toEqual([{ id: '1' }])
  })

  it('attaches the bearer token from getAuthToken', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    const client = createRestClient({ baseUrl: base, fetch, getAuthToken: () => 'tok' })
    await client.get('/users/me')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('returns undefined for 204 responses', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createRestClient({ baseUrl: base, fetch })
    await expect(client.del('/domains/1')).resolves.toBeUndefined()
  })

  it('throws ApiClientError with the server message on non-2xx', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Name taken' }, { status: 409 }))
    const client = createRestClient({ baseUrl: base, fetch })
    await expect(client.post('/domains', {})).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 409,
      message: 'Name taken',
    })
  })

  it('carries the backend error code so callers can branch on the cause', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: 'QUOTA_EXCEEDED', message: 'Monthly AI usage limit reached' },
          { status: 429 },
        ),
      )
    const client = createRestClient({ baseUrl: base, fetch })
    await expect(client.post('/ai/classify-fields', {})).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'Monthly AI usage limit reached',
    })
  })

  it('refreshes once on 401 then retries the original request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'ok' }))
    const refreshAuth = vi.fn().mockResolvedValue('new-token')
    const client = createRestClient({
      baseUrl: base,
      fetch,
      getAuthToken: () => 'old',
      refreshAuth,
    })

    const result = await client.get('/users/me')

    expect(refreshAuth).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token')
    expect(result).toEqual({ id: 'ok' })
  })

  it('coalesces concurrent 401s into a single refresh (queued refresh)', async () => {
    const fetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization
      return Promise.resolve(
        auth === 'Bearer new'
          ? jsonResponse({ ok: true })
          : jsonResponse({ message: 'expired' }, { status: 401 }),
      )
    })
    const refreshAuth = vi.fn().mockResolvedValue('new')
    const client = createRestClient({
      baseUrl: base,
      fetch,
      getAuthToken: () => 'old',
      refreshAuth,
    })

    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])

    expect(refreshAuth).toHaveBeenCalledOnce()
  })

  it('calls onAuthError and throws when refresh fails', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'expired' }, { status: 401 }))
    const refreshAuth = vi.fn().mockResolvedValue(undefined)
    const onAuthError = vi.fn()
    const client = createRestClient({
      baseUrl: base,
      fetch,
      getAuthToken: () => 'old',
      refreshAuth,
      onAuthError,
    })

    await expect(client.get('/users/me')).rejects.toBeInstanceOf(ApiClientError)
    expect(onAuthError).toHaveBeenCalledOnce()
  })

  it('skips auth + refresh for skipAuth requests', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    const refreshAuth = vi.fn()
    const client = createRestClient({
      baseUrl: base,
      fetch,
      getAuthToken: () => 'tok',
      refreshAuth,
    })
    await client.post('/auth/verify', { token: 't' }, { skipAuth: true })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})
