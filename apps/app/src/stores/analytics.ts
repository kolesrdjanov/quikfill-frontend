import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AnalyticsPeriod, AnalyticsResponse } from '@quikfill/schemas'
import { api } from '@/lib/api'

/** Admin-only usage/cost analytics. Views call `load`; never mutate `data` directly. */
export const useAnalyticsStore = defineStore('analytics', () => {
  const data = ref<AnalyticsResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const period = ref<AnalyticsPeriod>('current_month')

  async function load(next: AnalyticsPeriod): Promise<void> {
    loading.value = true
    error.value = null
    period.value = next
    try {
      data.value = await api.admin.analytics(next)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load analytics'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, period, load }
})
