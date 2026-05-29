import { describe, expect, it, vi } from 'vitest'
import type { FieldSummary } from '@quikfill/schemas'
import { ApiClientError, createAiClient } from './ai-client'

const summaries: FieldSummary[] = [{ fieldId: 'f1', inputType: 'text', label: 'First name' }]

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createAiClient.classifyFields', () => {
  it('posts the summaries to /ai/classify-fields and returns parsed suggestions', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ fieldId: 'f1', semanticType: 'person.firstName', confidence: 0.9 }]),
      )
    const client = createAiClient({ baseUrl: 'http://localhost:4010/api/v1', fetch })

    const result = await client.classifyFields(summaries)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:4010/api/v1/ai/classify-fields')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ fields: summaries })
    expect(result).toEqual([
      { fieldId: 'f1', semanticType: 'person.firstName', confidence: 0.9, reasons: [] },
    ])
  })

  it('drops malformed suggestion entries from the response', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse([
        { fieldId: 'f1', semanticType: 'email', confidence: 0.9 },
        { fieldId: 'f2', confidence: 5 },
      ]),
    )
    const client = createAiClient({ baseUrl: 'http://localhost:4010/api/v1', fetch })
    const result = await client.classifyFields(summaries)
    expect(result).toHaveLength(1)
    expect(result[0].fieldId).toBe('f1')
  })

  it('sends a bearer token when getAuthToken is provided', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([]))
    const client = createAiClient({
      baseUrl: 'http://localhost:4010/api/v1',
      fetch,
      getAuthToken: () => 'tok-123',
    })
    await client.classifyFields(summaries)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123')
  })

  it('throws ApiClientError carrying the status on a non-2xx response', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 503 }))
    const client = createAiClient({ baseUrl: 'http://localhost:4010/api/v1', fetch })
    await expect(client.classifyFields(summaries)).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 503,
    })
    await expect(client.classifyFields(summaries)).rejects.toBeInstanceOf(ApiClientError)
  })

  it('throws when the response body is not an array', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ not: 'an array' }))
    const client = createAiClient({ baseUrl: 'http://localhost:4010/api/v1', fetch })
    await expect(client.classifyFields(summaries)).rejects.toBeInstanceOf(ApiClientError)
  })
})

describe('createAiClient.suggestMappings', () => {
  it('posts summaries and context to /ai/suggest-mappings', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([]))
    const client = createAiClient({ baseUrl: 'http://localhost:4010/api/v1/', fetch })
    const context = { generatorPresetKinds: ['email', 'person'] }

    await client.suggestMappings(summaries, context)

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:4010/api/v1/ai/suggest-mappings')
    expect(JSON.parse(init.body)).toEqual({ fields: summaries, context })
  })
})
