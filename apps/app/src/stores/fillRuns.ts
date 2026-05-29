import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FillRun } from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useFillRunsStore = defineStore('fillRuns', () => {
  const items = ref<FillRun[]>([])
  const loading = ref(false)

  async function fetch(params?: { formProfileId?: string; limit?: number }): Promise<void> {
    loading.value = true
    try {
      items.value = await api.fillRuns.list(params)
    } finally {
      loading.value = false
    }
  }

  return { items, loading, fetch }
})
