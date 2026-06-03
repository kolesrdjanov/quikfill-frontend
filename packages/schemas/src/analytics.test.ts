import { describe, expect, it } from 'vitest'
import { analyticsResponseSchema } from './analytics'

const valid = {
  period: 'current_month',
  periodStart: '2026-06-01T00:00:00.000Z',
  periodEnd: '2026-06-03T10:00:00.000Z',
  generatedAt: '2026-06-03T10:00:00.000Z',
  model: 'gemini-2.5-flash-lite',
  pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
  overview: {
    totalUsers: 2,
    activeUsers: 1,
    totalRequests: 4,
    totalTokensIn: 1000,
    totalTokensOut: 200,
    totalTokens: 1200,
    estCostUsdCents: 0.018,
    monthlyRevenueUsdCents: 1200,
    netMarginUsdCents: 1199.982,
  },
  byEndpoint: [{ endpoint: 'fill', requests: 4, tokens: 1200 }],
  pagination: { page: 0, pageSize: 20, total: 1, totalPages: 1 },
  users: [
    {
      userId: '11111111-1111-4111-8111-111111111111',
      email: 's@x.com',
      planKey: 'starter',
      planDisplayName: 'Starter',
      planPriceUsdCents: 1200,
      planTokenLimit: 500000,
      requests: 4,
      tokensIn: 1000,
      tokensOut: 200,
      tokens: 1200,
      estCostUsdCents: 0.018,
      utilizationPercent: 0,
      marginUsdCents: 1199.982,
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ],
}

describe('analyticsResponseSchema', () => {
  it('parses a valid current_month response', () => {
    expect(analyticsResponseSchema.parse(valid).users).toHaveLength(1)
  })

  it('normalizes null nullable fields to undefined (all_time)', () => {
    const allTime = {
      ...valid,
      period: 'all_time',
      periodStart: null,
      overview: { ...valid.overview, netMarginUsdCents: null },
      users: [{ ...valid.users[0], utilizationPercent: null, marginUsdCents: null }],
    }
    const parsed = analyticsResponseSchema.parse(allTime)
    expect(parsed.periodStart).toBeUndefined()
    expect(parsed.overview.netMarginUsdCents).toBeUndefined()
    expect(parsed.users[0].utilizationPercent).toBeUndefined()
  })

  it('rejects a malformed response', () => {
    expect(() => analyticsResponseSchema.parse({ period: 'current_month' })).toThrow()
  })
})
