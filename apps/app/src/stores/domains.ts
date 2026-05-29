import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreateDomainInput, Domain, UpdateDomainInput } from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useDomainsStore = defineStore('domains', () => {
  const items = ref<Domain[]>([])
  const loading = ref(false)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      items.value = await api.domains.list()
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateDomainInput): Promise<Domain> {
    const created = await api.domains.create(input)
    items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateDomainInput): Promise<Domain> {
    const updated = await api.domains.update(id, input)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    await api.domains.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
