import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { ref, watch } from 'vue'
import type {
  CreateEntityRecordInput,
  EntityRecord,
  UpdateEntityRecordInput,
} from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useEntityRecordsStore = defineStore('entityRecords', () => {
  const items = ref<EntityRecord[]>([])
  const loading = ref(false)
  const auth = useAuthStore()
  let revision = 0
  watch(
    () => auth.user?.id,
    () => {
      ++revision
      items.value = []
      loading.value = false
    },
    { flush: 'sync' },
  )

  async function fetch(entityTypeId?: string): Promise<void> {
    const start = revision
    loading.value = true
    items.value = []
    try {
      const incoming = await api.entityRecords.list(entityTypeId ? { entityTypeId } : undefined)
      if (revision === start) items.value = incoming
    } finally {
      if (revision === start) loading.value = false
    }
  }

  async function create(input: CreateEntityRecordInput): Promise<EntityRecord> {
    const owner = auth.user?.id
    const created = await api.entityRecords.create(input)
    if (owner === auth.user?.id) items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateEntityRecordInput): Promise<EntityRecord> {
    const owner = auth.user?.id
    const updated = await api.entityRecords.update(id, input)
    if (owner === auth.user?.id)
      items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    const owner = auth.user?.id
    await api.entityRecords.remove(id)
    if (owner === auth.user?.id) items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
