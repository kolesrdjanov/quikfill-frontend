import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AnalyticsOrder,
  AnalyticsPeriod,
  AnalyticsResponse,
  AnalyticsSort,
} from '@quikfill/schemas'
import { api } from '@/lib/api'

/**
 * Admin-only usage/cost analytics. Period, page and sort live here; views call
 * the `set*` actions (which reload) and never mutate state directly. Pagination
 * and sorting are server-side, so changing them refetches.
 */
export const useAnalyticsStore = defineStore('analytics', () => {
  const data = ref<AnalyticsResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const period = ref<AnalyticsPeriod>('current_month')
  const page = ref(0)
  const pageSize = ref(20)
  const sort = ref<AnalyticsSort>('tokens')
  const order = ref<AnalyticsOrder>('desc')

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      data.value = await api.admin.analytics({
        period: period.value,
        page: page.value,
        pageSize: pageSize.value,
        sort: sort.value,
        order: order.value,
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load analytics'
    } finally {
      loading.value = false
    }
  }

  /** Switch the reporting window; resets to the first page. */
  function setPeriod(next: AnalyticsPeriod): Promise<void> {
    period.value = next
    page.value = 0
    return load()
  }

  /** Jump to a zero-based page index. */
  function setPage(next: number): Promise<void> {
    page.value = next
    return load()
  }

  /** Sort by a column; reselecting the active column flips the order. Resets to page 0. */
  function setSort(key: AnalyticsSort): Promise<void> {
    if (sort.value === key) {
      order.value = order.value === 'desc' ? 'asc' : 'desc'
    } else {
      sort.value = key
      order.value = 'desc'
    }
    page.value = 0
    return load()
  }

  return {
    data,
    loading,
    error,
    period,
    page,
    pageSize,
    sort,
    order,
    load,
    setPeriod,
    setPage,
    setSort,
  }
})
