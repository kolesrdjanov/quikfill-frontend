import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AnalyticsResponse } from '@quikfill/schemas'

const analytics = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { admin: { analytics: (...args: unknown[]) => analytics(...args) } },
}))

import { useAnalyticsStore } from './analytics'

function report(overrides: Partial<AnalyticsResponse> = {}): AnalyticsResponse {
  return {
    period: 'current_month',
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEnd: '2026-06-03T00:00:00.000Z',
    generatedAt: '2026-06-03T00:00:00.000Z',
    model: 'gemini-2.5-flash-lite',
    pricing: { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.4 },
    overview: {
      totalUsers: 1,
      activeUsers: 1,
      totalRequests: 1,
      totalTokensIn: 1000,
      totalTokensOut: 200,
      totalTokens: 1200,
      estCostUsdCents: 0.018,
      monthlyRevenueUsdCents: 1200,
      netMarginUsdCents: 1199.982,
    },
    byEndpoint: [{ endpoint: 'fill', requests: 1, tokens: 1200 }],
    users: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('analytics store', () => {
  it('load fetches the report for the period and clears loading', async () => {
    const data = report()
    analytics.mockResolvedValue(data)
    const store = useAnalyticsStore()

    await store.load('current_month')

    expect(analytics).toHaveBeenCalledWith('current_month')
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.data).toEqual(data)
    expect(store.period).toBe('current_month')
  })

  it('load records an error and clears loading on failure', async () => {
    analytics.mockRejectedValue(new Error('boom'))
    const store = useAnalyticsStore()

    await store.load('all_time')

    expect(store.loading).toBe(false)
    expect(store.error).toBe('boom')
    expect(store.data).toBeNull()
  })
})
