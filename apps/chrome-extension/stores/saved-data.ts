import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  readLocalFillPreferences,
  writeLocalFillPreferences,
  requestSavedLibrary,
} from '@quikfill/browser-adapter'
import type { SavedLibrary } from '@quikfill/schemas'
export const useSavedDataStore = defineStore('saved-data', () => {
  const library = ref<SavedLibrary | null>(null),
    active = ref(''),
    message = ref(''),
    busy = ref(false)
  let revision = 0
  async function load() {
    const start = revision
    busy.value = true
    message.value = ''
    try {
      const incoming = await requestSavedLibrary()
      const prefs = await readLocalFillPreferences()
      if (revision !== start) return
      library.value = incoming
      active.value = prefs.savedOwnerId === incoming.ownerId ? (prefs.savedRecordId ?? '') : ''
      message.value = `Synced ${new Date(incoming.syncedAt).toLocaleString()}`
    } catch (error) {
      if (revision !== start) return
      library.value = null
      message.value = error instanceof Error ? error.message : 'Could not load saved data.'
    } finally {
      if (revision === start) busy.value = false
    }
  }
  async function choose(recordId: string) {
    const data = library.value
    if (!data || !data.records.some((r) => r.id === recordId))
      throw new Error('Load and select a current record.')
    await writeLocalFillPreferences({
      ...(await readLocalFillPreferences()),
      mode: 'saved',
      savedOwnerId: data.ownerId,
      savedRecordId: recordId,
    })
    active.value = recordId
    message.value = 'Saved-data mode active. Use Fill beside the form.'
  }
  async function sample() {
    const next = { ...(await readLocalFillPreferences()), mode: 'sample' as const }
    delete next.savedOwnerId
    delete next.savedRecordId
    await writeLocalFillPreferences(next)
    active.value = ''
    message.value = 'Sample mode active.'
  }
  function clear() {
    ++revision
    busy.value = false
    library.value = null
    active.value = ''
    message.value = 'Account changed. Load saved data again.'
  }
  return { library, active, message, busy, load, choose, sample, clear }
})
