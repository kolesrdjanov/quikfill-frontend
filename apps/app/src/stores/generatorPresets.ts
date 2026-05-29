import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  CreateGeneratorPresetInput,
  GeneratorPreset,
  UpdateGeneratorPresetInput,
} from '@quikfill/schemas'
import { api } from '@/lib/api'

export const useGeneratorPresetsStore = defineStore('generatorPresets', () => {
  const items = ref<GeneratorPreset[]>([])
  const loading = ref(false)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      items.value = await api.generatorPresets.list()
    } finally {
      loading.value = false
    }
  }

  async function create(input: CreateGeneratorPresetInput): Promise<GeneratorPreset> {
    const created = await api.generatorPresets.create(input)
    items.value = [created, ...items.value]
    return created
  }

  async function update(id: string, input: UpdateGeneratorPresetInput): Promise<GeneratorPreset> {
    const updated = await api.generatorPresets.update(id, input)
    items.value = items.value.map((item) => (item.id === id ? updated : item))
    return updated
  }

  async function remove(id: string): Promise<void> {
    await api.generatorPresets.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, create, update, remove }
})
