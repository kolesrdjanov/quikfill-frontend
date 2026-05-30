import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG, planByKey } from './plan-catalog'

describe('PLAN_CATALOG', () => {
  it('lists the four tiers in ascending order', () => {
    expect(PLAN_CATALOG.map((p) => p.key)).toEqual(['free', 'starter', 'pro', 'enterprise'])
  })

  it('publishes the doc-authoritative marketing fill figures', () => {
    expect(PLAN_CATALOG.map((p) => p.marketingFills)).toEqual([
      '~10',
      '~1,500',
      '~6,000',
      '~20,000+',
    ])
  })

  it('matches the documented prices and token caps', () => {
    expect(PLAN_CATALOG.map((p) => [p.priceLabel, p.tokenLimit])).toEqual([
      ['$0', 2500],
      ['$12', 500_000],
      ['$29', 2_000_000],
      ['$99+', 8_000_000],
    ])
  })

  it('marks only Pro Tester as recommended', () => {
    expect(PLAN_CATALOG.filter((p) => p.recommended).map((p) => p.key)).toEqual(['pro'])
  })

  it('makes every paid tier self-serve and free not', () => {
    expect(PLAN_CATALOG.filter((p) => p.selfServe).map((p) => p.key)).toEqual([
      'starter',
      'pro',
      'enterprise',
    ])
  })
})

describe('planByKey', () => {
  it('returns the requested entry', () => {
    expect(planByKey('pro').displayName).toBe('Pro Tester')
  })
  it('throws on an unknown key', () => {
    // @ts-expect-error — exercising the runtime guard with an invalid key
    expect(() => planByKey('platinum')).toThrow()
  })
})
