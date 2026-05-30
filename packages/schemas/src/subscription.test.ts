import { describe, expect, it } from 'vitest'
import {
  createCheckoutSessionInputSchema,
  entitlementsResponseSchema,
  planKeySchema,
  sessionUrlResponseSchema,
  subscriptionStatusSchema,
} from './subscription'

describe('entitlementsResponseSchema', () => {
  it('parses a paid-plan entitlements payload', () => {
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'starter',
      displayName: 'Starter',
      status: 'active',
      tokensUsed: 12_340,
      tokenLimit: 500_000,
      currentPeriodEnd: '2026-06-29T00:00:00.000Z',
    })
    expect(parsed.planKey).toBe('starter')
    expect(parsed.currentPeriodEnd).toBe('2026-06-29T00:00:00.000Z')
  })

  it('normalizes a null currentPeriodEnd (free users) to undefined', () => {
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'free',
      displayName: 'Free',
      status: 'active',
      tokensUsed: 0,
      tokenLimit: 2500,
      currentPeriodEnd: null,
    })
    expect(parsed.currentPeriodEnd).toBeUndefined()
  })

  it('rejects an unknown plan key', () => {
    expect(() =>
      entitlementsResponseSchema.parse({
        planKey: 'platinum',
        displayName: 'Platinum',
        status: 'active',
        tokensUsed: 0,
        tokenLimit: 0,
        currentPeriodEnd: null,
      }),
    ).toThrow()
  })

  it('rejects a negative token counter', () => {
    expect(() =>
      entitlementsResponseSchema.parse({
        planKey: 'free',
        displayName: 'Free',
        status: 'active',
        tokensUsed: -1,
        tokenLimit: 2500,
        currentPeriodEnd: null,
      }),
    ).toThrow()
  })
})

describe('createCheckoutSessionInputSchema', () => {
  it('accepts a paid plan', () => {
    expect(createCheckoutSessionInputSchema.parse({ planKey: 'pro' }).planKey).toBe('pro')
  })
  it('rejects the free plan (not purchasable)', () => {
    expect(() => createCheckoutSessionInputSchema.parse({ planKey: 'free' })).toThrow()
  })
})

describe('sessionUrlResponseSchema', () => {
  it('accepts an absolute URL', () => {
    const parsed = sessionUrlResponseSchema.parse({
      url: 'https://checkout.stripe.com/c/pay/cs_test',
    })
    expect(parsed.url).toContain('stripe.com')
  })
  it('rejects a non-URL', () => {
    expect(() => sessionUrlResponseSchema.parse({ url: 'not-a-url' })).toThrow()
  })
})

describe('enums', () => {
  it('planKeySchema covers the four tiers', () => {
    expect(planKeySchema.options).toEqual(['free', 'starter', 'pro', 'enterprise'])
  })
  it('subscriptionStatusSchema covers the Stripe lifecycle states', () => {
    expect(subscriptionStatusSchema.options).toEqual([
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
    ])
  })
})
