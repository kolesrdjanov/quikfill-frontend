/// <reference types="chrome" />
import {
  savedLibrarySchema,
  savedRecordSnapshotSchema,
  savedSelectionSchema,
  type SavedLibrary,
  type StorageAdapter,
  type EntityType,
  type EntityRecord,
  type SavedRecordSnapshot,
} from '@quikfill/schemas'
export const SAVED_CACHE_MS = 24 * 3600_000
export function createSavedDataService(deps: {
  storage: StorageAdapter
  accountId(): Promise<string | null>
  session(): Promise<{
    userId: string
    load(): Promise<{ types: EntityType[]; records: EntityRecord[] }>
  } | null>
}) {
  async function library(): Promise<SavedLibrary> {
    const session = await deps.session()
    if (!session) throw new Error('Sign in to sync your saved data. Sample Fill remains available.')
    const key = `saved-library:${session.userId}`
    const current = async () => {
      if ((await deps.accountId()) !== session.userId)
        throw new Error('Account changed. Load saved data again.')
    }
    try {
      const data = await session.load()
      const snapshot = savedLibrarySchema.parse({
        ...data,
        ownerId: session.userId,
        syncedAt: new Date().toISOString(),
      })
      await current()
      await deps.storage.set(key, snapshot)
      await current()
      return snapshot
    } catch (error) {
      await current()
      const status =
        typeof error === 'object' && error && 'status' in error
          ? (error as { status: number }).status
          : undefined
      if (status && status < 500) throw error
      const cached = savedLibrarySchema.safeParse(await deps.storage.get(key))
      await current()
      if (
        cached.success &&
        cached.data.ownerId === session.userId &&
        Date.now() >= Date.parse(cached.data.syncedAt) &&
        Date.now() - Date.parse(cached.data.syncedAt) < SAVED_CACHE_MS
      )
        return cached.data
      throw new Error('Saved data is unavailable. Connect to sync or switch to sample Fill.', {
        cause: error,
      })
    }
  }
  return {
    library,
    async selected(raw: { ownerId: string; recordId: string }): Promise<SavedRecordSnapshot> {
      const selection = savedSelectionSchema.parse(raw)
      if ((await deps.accountId()) !== selection.ownerId)
        throw new Error('Select a record for your current account in the popup.')
      const data = await library()
      if (data.ownerId !== selection.ownerId)
        throw new Error('Account changed. Select a record again.')
      const record = data.records.find((r) => r.id === selection.recordId)
      const type = record && data.types.find((t) => t.id === record.entityTypeId)
      if (!record || !type)
        throw new Error('Saved record is no longer available. Select another record.')
      return savedRecordSnapshotSchema.parse({ ownerId: data.ownerId, record, type })
    },
    async prune() {
      for (const key of await deps.storage.list('saved-library:')) {
        const data = savedLibrarySchema.safeParse(await deps.storage.get(key))
        if (
          !data.success ||
          Date.parse(data.data.syncedAt) > Date.now() ||
          Date.now() - Date.parse(data.data.syncedAt) >= SAVED_CACHE_MS
        )
          await deps.storage.delete(key)
      }
    },
  }
}
const SAVED_DATA = 'SAVED_DATA'
export async function requestSavedLibrary(): Promise<SavedLibrary> {
  const reply = await chrome.runtime.sendMessage({ type: SAVED_DATA, action: 'library' })
  if (!reply?.ok) throw new Error(reply?.error || 'Saved data is unavailable.')
  return savedLibrarySchema.parse(reply.data)
}
export async function requestSavedRecord(selection: {
  ownerId: string
  recordId: string
}): Promise<SavedRecordSnapshot> {
  const reply = await chrome.runtime.sendMessage({
    type: SAVED_DATA,
    action: 'selected',
    selection,
  })
  if (!reply?.ok) throw new Error(reply?.error || 'Saved record is unavailable.')
  return savedRecordSnapshotSchema.parse(reply.data)
}
export function onSavedDataRequest(service: ReturnType<typeof createSavedDataService>) {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== SAVED_DATA) return undefined
    // Full account library is popup-only; content scripts may ask only for the
    // user-selected record, never enumerate an account's stored values.
    if (message.action === 'library' && sender.tab) {
      respond({ ok: false, error: 'Open the popup to load saved data.' })
      return false
    }
    const run =
      message.action === 'library'
        ? service.library()
        : message.action === 'selected'
          ? service.selected(message.selection)
          : Promise.reject(new Error('Unknown saved-data action.'))
    run
      .then((data) => respond({ ok: true, data }))
      .catch((e) =>
        respond({ ok: false, error: e instanceof Error ? e.message : 'Saved data unavailable.' }),
      )
    return true
  })
}
export function onAccountChange(callback: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes['auth:state']) callback()
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
