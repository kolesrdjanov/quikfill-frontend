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
      fillsUsed: 47,
      fillLimit: 200,
      currentPeriodEnd: '2026-06-29T00:00:00.000Z',
    })
    expect(parsed.planKey).toBe('starter')
    expect(parsed.currentPeriodEnd).toBe('2026-06-29T00:00:00.000Z')
  })

  it('defaults cancelAtPeriodEnd to false when the backend omits it', () => {
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'starter',
      displayName: 'Starter',
      status: 'active',
      fillsUsed: 0,
      fillLimit: 200,
      currentPeriodEnd: null,
    })
    expect(parsed.cancelAtPeriodEnd).toBe(false)
  })

  it('captures a pending cancellation (cancelAtPeriodEnd: true)', () => {
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'starter',
      displayName: 'Starter',
      status: 'active',
      cancelAtPeriodEnd: true,
      fillsUsed: 0,
      fillLimit: 200,
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    })
    expect(parsed.cancelAtPeriodEnd).toBe(true)
  })

  it('normalizes a null currentPeriodEnd (free users) to undefined', () => {
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'free',
      displayName: 'Free',
      status: 'active',
      fillsUsed: 0,
      fillLimit: 10,
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
        fillsUsed: 0,
        fillLimit: 0,
        currentPeriodEnd: null,
      }),
    ).toThrow()
  })

  it('rejects a negative fill counter', () => {
    expect(() =>
      entitlementsResponseSchema.parse({
        planKey: 'free',
        displayName: 'Free',
        status: 'active',
        fillsUsed: -1,
        fillLimit: 10,
        currentPeriodEnd: null,
      }),
    ).toThrow()
  })

  it('parses a paused subscription (a Stripe status the old enum omitted)', () => {
    // The backend persists Stripe's raw `subscription.status`; `paused` (along with
    // `unpaid` / `incomplete_expired`) used to be absent from the enum, so any user
    // in that state failed the whole parse and bricked the popup. Regression guard.
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'pro',
      displayName: 'Pro',
      status: 'paused',
      fillsUsed: 12,
      fillLimit: 1000,
      currentPeriodEnd: null,
    })
    expect(parsed.status).toBe('paused')
  })

  it('falls back to "active" for an unknown future status instead of throwing', () => {
    // `status` is display-only in the popup, so a status Stripe introduces later
    // must degrade to a safe known value — never throw and brick the entitlements
    // panel (which would leave it stuck on "Loading your plan…" forever).
    const parsed = entitlementsResponseSchema.parse({
      planKey: 'pro',
      displayName: 'Pro',
      status: 'some_unreleased_stripe_status',
      fillsUsed: 0,
      fillLimit: 1000,
      currentPeriodEnd: null,
    })
    expect(parsed.status).toBe('active')
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
  it('subscriptionStatusSchema mirrors the full Stripe status set', () => {
    expect(subscriptionStatusSchema.options).toEqual([
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused',
    ])
  })
})
