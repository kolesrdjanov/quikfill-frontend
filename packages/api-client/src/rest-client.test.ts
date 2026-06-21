import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './rest-client'

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

const base = 'http://localhost:4010/api/v1'

describe('api.subscriptions', () => {
  it('fetches and validates entitlements (null period normalizes to undefined)', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        planKey: 'free',
        displayName: 'Free',
        status: 'active',
        fillsUsed: 0,
        fillLimit: 10,
        currentPeriodEnd: null,
      }),
    )
    const api = createApiClient({ baseUrl: base, fetch })

    const result = await api.subscriptions.entitlements()

    expect(fetch.mock.calls[0][0]).toBe(`${base}/entitlements`)
    expect(result.planKey).toBe('free')
    expect(result.currentPeriodEnd).toBeUndefined()
  })

  it('posts the plan key to checkout-session and returns the url', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }))
    const api = createApiClient({ baseUrl: base, fetch })

    const result = await api.subscriptions.createCheckoutSession({ planKey: 'pro' })

    expect(fetch.mock.calls[0][0]).toBe(`${base}/subscriptions/checkout-session`)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ planKey: 'pro' })
    expect(result.url).toContain('checkout.stripe.com')
  })

  it('rejects a non-paid plan before hitting the network', () => {
    const fetch = vi.fn()
    const api = createApiClient({ baseUrl: base, fetch })

    // The input is validated synchronously (before the request promise exists),
    // so an invalid plan throws on the call rather than rejecting.
    expect(() =>
      // @ts-expect-error — free is not a PaidPlanKey; guard runs at runtime too
      api.subscriptions.createCheckoutSession({ planKey: 'free' }),
    ).toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens the portal session with no body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ url: 'https://billing.stripe.com/p/session_123' }))
    const api = createApiClient({ baseUrl: base, fetch })

    const result = await api.subscriptions.createPortalSession()

    expect(fetch.mock.calls[0][0]).toBe(`${base}/subscriptions/portal-session`)
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
    expect(result.url).toContain('billing.stripe.com')
  })

  it('surfaces a QUOTA_EXCEEDED code from a 429', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: 'QUOTA_EXCEEDED',
          message: 'Monthly AI token limit reached',
          limitExceeded: true,
        },
        { status: 429 },
      ),
    )
    const api = createApiClient({ baseUrl: base, fetch })

    await expect(api.subscriptions.entitlements()).rejects.toMatchObject({
      status: 429,
      code: 'QUOTA_EXCEEDED',
    })
  })
})
