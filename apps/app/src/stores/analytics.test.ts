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
    pagination: { page: 0, pageSize: 20, total: 1, totalPages: 1 },
    users: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('analytics store', () => {
  it('load fetches the report with the current params and clears loading', async () => {
    const data = report()
    analytics.mockResolvedValue(data)
    const store = useAnalyticsStore()

    await store.load()

    expect(analytics).toHaveBeenCalledWith({
      period: 'current_month',
      page: 0,
      pageSize: 20,
      sort: 'tokens',
      order: 'desc',
    })
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.data).toEqual(data)
  })

  it('records an error and clears loading on failure', async () => {
    analytics.mockRejectedValue(new Error('boom'))
    const store = useAnalyticsStore()

    await store.load()

    expect(store.loading).toBe(false)
    expect(store.error).toBe('boom')
    expect(store.data).toBeNull()
  })

  it('setPeriod switches window and resets to page 0', async () => {
    analytics.mockResolvedValue(report())
    const store = useAnalyticsStore()
    store.page = 3

    await store.setPeriod('all_time')

    expect(store.period).toBe('all_time')
    expect(store.page).toBe(0)
    expect(analytics).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: 'all_time', page: 0 }),
    )
  })

  it('setSort flips order when reselecting the active column, resets page', async () => {
    analytics.mockResolvedValue(report())
    const store = useAnalyticsStore()
    store.page = 2

    await store.setSort('tokens') // already the active sort -> flips desc->asc
    expect(store.sort).toBe('tokens')
    expect(store.order).toBe('asc')
    expect(store.page).toBe(0)

    await store.setSort('email') // new column -> defaults to desc
    expect(store.sort).toBe('email')
    expect(store.order).toBe('desc')
  })

  it('setPage updates the page index and reloads', async () => {
    analytics.mockResolvedValue(report())
    const store = useAnalyticsStore()

    await store.setPage(2)

    expect(store.page).toBe(2)
    expect(analytics).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })
})
