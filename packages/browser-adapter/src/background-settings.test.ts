import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionSettings,
  type StorageAdapter,
} from '@quikfill/schemas'
import { createBackgroundSettings, PENDING_SETTINGS_KEY } from './background-settings'

function setup() {
  const data = new Map<string, unknown>()
  const storage: StorageAdapter = {
    get: async <T>(key: string) => (data.get(key) as T) ?? null,
    set: async (key, value) => {
      data.set(key, value)
    },
    delete: async (key) => {
      data.delete(key)
    },
    list: async () => [...data.keys()],
  }
  let local = DEFAULT_EXTENSION_SETTINGS
  let remote = DEFAULT_EXTENSION_SETTINGS
  const deps = {
    storage,
    hasSession: vi.fn(async () => false),
    writeLocal: vi.fn(async (s: ExtensionSettings) => {
      local = s
    }),
    loadRemote: vi.fn(async () => remote),
    saveRemote: vi.fn(async (s: ExtensionSettings) => {
      remote = s
    }),
  }
  return {
    data,
    deps,
    get local() {
      return local
    },
    service: createBackgroundSettings(deps),
  }
}
const off = { ...DEFAULT_EXTENSION_SETTINGS, globalEnabled: false }

describe('local-first extension settings', () => {
  it('saves signed out without calling the account API', async () => {
    const h = setup()
    expect(await h.service.save(off)).toEqual(off)
    await h.service.sync()
    expect(h.local.globalEnabled).toBe(false)
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(true)
    expect(h.deps.loadRemote).not.toHaveBeenCalled()
    expect(h.deps.saveRemote).not.toHaveBeenCalled()
  })

  it('survives offline failure and worker restart, then pushes before pulling', async () => {
    const h = setup()
    await h.service.save(off)
    await h.service.sync()
    h.deps.hasSession.mockResolvedValue(true)
    h.deps.saveRemote.mockRejectedValueOnce(new Error('offline'))
    expect(await h.service.sync()).toBeNull()
    expect(h.local).toEqual(off)
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(true)
    const restarted = createBackgroundSettings(h.deps)
    await restarted.sync()
    expect(h.local).toEqual(off)
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(false)
  })

  it('keeps the newer local edit when an earlier upload is in flight', async () => {
    const h = setup()
    await h.service.save(off)
    await h.service.sync()
    h.deps.hasSession.mockResolvedValue(true)
    let release!: () => void
    h.deps.saveRemote.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const sync = h.service.sync()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const newer = { ...off, blockedHostnames: ['example.com'] }
    await h.service.save(newer)
    release()
    await sync
    expect(h.deps.saveRemote).toHaveBeenLastCalledWith(newer)
    expect(h.local).toEqual(newer)
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(false)
  })

  it('does not clobber a local edit made during a remote read', async () => {
    const h = setup()
    h.deps.hasSession.mockResolvedValue(true)
    let release!: (value: ExtensionSettings) => void
    h.deps.loadRemote.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const sync = h.service.sync()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await h.service.save(off)
    release(DEFAULT_EXTENSION_SETTINGS)
    await sync
    expect(h.local).toEqual(off)
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(true)
    await h.service.sync()
    expect(h.data.has(PENDING_SETTINGS_KEY)).toBe(false)
  })
})
