import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { ref, watch } from 'vue'
import type { CreateEntityTypeInput, EntityType, UpdateEntityTypeInput } from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useEntityTypesStore = defineStore('entityTypes', () => {
  const items = ref<EntityType[]>([])
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

  async function fetch(): Promise<void> {
    const start = revision
    loading.value = true
    items.value = []
    try {
      const incoming = await api.entityTypes.list()
      if (revision === start) items.value = incoming
    } finally {
      if (revision === start) loading.value = false
    }
  }

  async function create(input: CreateEntityTypeInput): Promise<EntityType> {
    const owner = auth.user?.id
    const created = await api.entityTypes.create(input)
    if (owner === auth.user?.id) items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateEntityTypeInput): Promise<EntityType> {
    const owner = auth.user?.id
    const updated = await api.entityTypes.update(id, input)
    if (owner === auth.user?.id)
      items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    const owner = auth.user?.id
    await api.entityTypes.remove(id)
    if (owner === auth.user?.id) items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
