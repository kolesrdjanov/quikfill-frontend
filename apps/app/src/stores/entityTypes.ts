import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreateEntityTypeInput, EntityType, UpdateEntityTypeInput } from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useEntityTypesStore = defineStore('entityTypes', () => {
  const items = ref<EntityType[]>([])
  const loading = ref(false)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      items.value = await api.entityTypes.list()
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateEntityTypeInput): Promise<EntityType> {
    const created = await api.entityTypes.create(input)
    items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateEntityTypeInput): Promise<EntityType> {
    const updated = await api.entityTypes.update(id, input)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    await api.entityTypes.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
