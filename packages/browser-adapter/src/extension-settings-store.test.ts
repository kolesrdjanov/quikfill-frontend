/// <reference types="chrome" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS } from '@quikfill/schemas'
import {
  EXTENSION_SETTINGS_KEY,
  onExtensionSettingsChange,
  readExtensionSettings,
  writeExtensionSettings,
} from './extension-settings-store'

function fakeArea(): chrome.storage.StorageArea {
  const data: Record<string, unknown> = {}
  return {
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (obj: Record<string, unknown>) => {
      Object.assign(data, obj)
    },
    remove: async (key: string) => {
      delete data[key]
    },
  } as unknown as chrome.storage.StorageArea
}

describe('extension-settings-store', () => {
  it('returns the defaults before anything is written', async () => {
    expect(await readExtensionSettings(fakeArea())).toEqual(DEFAULT_EXTENSION_SETTINGS)
  })

  it('writes and reads back a full settings object', async () => {
    const area = fakeArea()
    const settings = {
      ...DEFAULT_EXTENSION_SETTINGS,
      globalEnabled: false,
      buttonSize: 'lg' as const,
    }
    await writeExtensionSettings(settings, area)
    expect(await readExtensionSettings(area)).toEqual(settings)
  })

  it('upgrades a partial/older payload by layering it over the defaults', async () => {
    const area = fakeArea()
    await area.set({ [EXTENSION_SETTINGS_KEY]: { theme: 'dark', blockedHostnames: ['x.example'] } })
    const read = await readExtensionSettings(area)
    expect(read.theme).toBe('dark')
    expect(read.blockedHostnames).toEqual(['x.example'])
    // A field missing from the stored payload comes from the defaults.
    expect(read.globalEnabled).toBe(DEFAULT_EXTENSION_SETTINGS.globalEnabled)
    expect(read.buttonSize).toBe(DEFAULT_EXTENSION_SETTINGS.buttonSize)
  })
})

describe('onExtensionSettingsChange', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
  })

  function installChrome() {
    const listeners: ((
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void)[] = []
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: {
        onChanged: {
          addListener: (l: (typeof listeners)[number]) => listeners.push(l),
          removeListener: (l: (typeof listeners)[number]) => {
            const i = listeners.indexOf(l)
            if (i >= 0) listeners.splice(i, 1)
          },
        },
      },
    }
    return listeners
  }

  it('fires with the coerced settings on a local change and ignores other areas', () => {
    const listeners = installChrome()
    const cb = vi.fn()
    onExtensionSettingsChange(cb)
    const next = { ...DEFAULT_EXTENSION_SETTINGS, showFillButton: false }
    listeners[0]({ [EXTENSION_SETTINGS_KEY]: { oldValue: null, newValue: next } }, 'local')
    expect(cb).toHaveBeenCalledWith(next)
    listeners[0]({ [EXTENSION_SETTINGS_KEY]: { newValue: next } }, 'sync')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes', () => {
    const listeners = installChrome()
    const off = onExtensionSettingsChange(vi.fn())
    off()
    expect(listeners).toHaveLength(0)
  })
})
