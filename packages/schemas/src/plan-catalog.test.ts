import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG, planByKey } from './plan-catalog'

describe('PLAN_CATALOG', () => {
  it('lists the four tiers in ascending order', () => {
    expect(PLAN_CATALOG.map((p) => p.key)).toEqual(['free', 'starter', 'pro', 'enterprise'])
  })

  it('publishes the doc-authoritative marketing fill figures', () => {
    expect(PLAN_CATALOG.map((p) => p.marketingFills)).toEqual(['10', '200', '1,000', '10,000'])
  })

  it('matches the documented prices and fill caps', () => {
    expect(PLAN_CATALOG.map((p) => [p.priceLabel, p.fillLimit])).toEqual([
      ['$0', 10],
      ['$12', 200],
      ['$29', 1000],
      ['$99+', 10000],
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
