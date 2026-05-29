import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  CreateFormProfileInput,
  FieldMapping,
  FormProfile,
  UpdateFieldMappingInput,
  UpdateFormProfileInput,
} from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useFormProfilesStore = defineStore('formProfiles', () => {
  const items = ref<FormProfile[]>([])
  const loading = ref(false)

  // Detail-view state (mapping review).
  const current = ref<FormProfile | null>(null)
  const mappings = ref<FieldMapping[]>([])
  const detailLoading = ref(false)

  async function fetch(domainId?: string): Promise<void> {
    loading.value = true
    try {
      items.value = await api.formProfiles.list(domainId ? { domainId } : undefined)
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateFormProfileInput): Promise<FormProfile> {
    const created = await api.formProfiles.create(input)
    items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateFormProfileInput): Promise<FormProfile> {
    const updated = await api.formProfiles.update(id, input)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    if (current.value?.id === id) current.value = updated
    return updated
  }

  async function remove(id: string): Promise<void> {
    await api.formProfiles.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  async function fetchDetail(id: string): Promise<void> {
    detailLoading.value = true
    current.value = null
    mappings.value = []
    try {
      const [profile, profileMappings] = await Promise.all([
        api.formProfiles.get(id),
        api.formProfiles.listMappings(id),
      ])
      current.value = profile
      mappings.value = profileMappings
    } finally {
      detailLoading.value = false
    }
  }

  async function updateMapping(id: string, input: UpdateFieldMappingInput): Promise<FieldMapping> {
    const updated = await api.fieldMappings.update(id, input)
    mappings.value = mappings.value.map((mapping) => (mapping.id === id ? updated : mapping))
    return updated
  }

  async function removeMapping(id: string): Promise<void> {
    await api.fieldMappings.remove(id)
    mappings.value = mappings.value.filter((mapping) => mapping.id !== id)
  }

  return {
    items,
    loading,
    current,
    mappings,
    detailLoading,
    fetch,
    create,
    update,
    remove,
    fetchDetail,
    updateMapping,
    removeMapping,
  }
})
