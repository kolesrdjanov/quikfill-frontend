import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  CreateEntityRecordInput,
  EntityRecord,
  UpdateEntityRecordInput,
} from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useEntityRecordsStore = defineStore('entityRecords', () => {
  const items = ref<EntityRecord[]>([])
  const loading = ref(false)

  async function fetch(entityTypeId?: string): Promise<void> {
    loading.value = true
    try {
      items.value = await api.entityRecords.list(entityTypeId ? { entityTypeId } : undefined)
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateEntityRecordInput): Promise<EntityRecord> {
    const created = await api.entityRecords.create(input)
    items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateEntityRecordInput): Promise<EntityRecord> {
    const updated = await api.entityRecords.update(id, input)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    await api.entityRecords.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
