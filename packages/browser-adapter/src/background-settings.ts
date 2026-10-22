import {
  extensionSettingsSchema,
  pendingExtensionSettingsSchema,
  type ExtensionSettings,
  type StorageAdapter,
} from '@quikfill/schemas'

export const PENDING_SETTINGS_KEY = 'settings:pending-account'

/** Local writes work signed out/offline. A durable outbox wins over stale account settings. */
export function createBackgroundSettings(deps: {
  storage: StorageAdapter
  hasSession(): Promise<boolean>
  writeLocal(settings: ExtensionSettings): Promise<void>
  loadRemote(): Promise<ExtensionSettings | null>
  saveRemote(settings: ExtensionSettings): Promise<void>
}) {
  let inFlight: Promise<ExtensionSettings | null> | null = null
  let writes = Promise.resolve()
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = writes.then(fn)
    writes = next.then(
      () => {},
      () => {},
    )
    return next
  }
  const pending = async () => {
    const parsed = pendingExtensionSettingsSchema.safeParse(
      await deps.storage.get(PENDING_SETTINGS_KEY),
    )
    return parsed.success ? parsed.data : null
  }

  async function reconcile(): Promise<ExtensionSettings | null> {
    try {
      if (!(await deps.hasSession())) return null
      await writes
      let next = await pending()
      while (next) {
        const revision = next.revision
        await deps.saveRemote(next.settings)
        await enqueue(async () => {
          if ((await pending())?.revision === revision)
            await deps.storage.delete(PENDING_SETTINGS_KEY)
        })
        next = await pending()
      }
      const remote = await deps.loadRemote()
      return enqueue(async () => {
        if (!remote || (await pending())) return null
        await deps.writeLocal(remote)
        return remote
      })
    } catch {
      return null // Preserve local settings and the pending write for the next sync.
    }
  }

  function sync(): Promise<ExtensionSettings | null> {
    if (!inFlight)
      inFlight = reconcile().finally(() => {
        inFlight = null
      })
    return inFlight
  }

  async function save(raw: ExtensionSettings): Promise<ExtensionSettings> {
    const settings = extensionSettingsSchema.parse(raw)
    await enqueue(async () => {
      await deps.storage.set(PENDING_SETTINGS_KEY, { revision: crypto.randomUUID(), settings })
      await deps.writeLocal(settings)
    })
    void sync()
    return settings
  }
  return { save, sync }
}
