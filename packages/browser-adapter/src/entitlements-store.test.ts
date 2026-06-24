/// <reference types="chrome" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entitlements } from '@quikfill/schemas'
import {
  ENTITLEMENTS_STATE_KEY,
  createEntitlementsStore,
  onEntitlementsChange,
} from './entitlements-store'

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

const ENT: Entitlements = {
  planKey: 'starter',
  displayName: 'Starter',
  status: 'active',
  cancelAtPeriodEnd: false,
  fillsUsed: 10,
  fillLimit: 200,
}

describe('entitlements-store', () => {
  it('returns null before anything is written', async () => {
    const store = createEntitlementsStore(fakeArea())
    expect(await store.read()).toBeNull()
  })

  it('writes and reads back the snapshot', async () => {
    const store = createEntitlementsStore(fakeArea())
    await store.write(ENT)
    expect(await store.read()).toEqual(ENT)
  })

  it('clears the snapshot', async () => {
    const store = createEntitlementsStore(fakeArea())
    await store.write(ENT)
    await store.clear()
    expect(await store.read()).toBeNull()
  })

  it('exposes the watched storage key', () => {
    expect(ENTITLEMENTS_STATE_KEY).toBe('entitlements:current')
  })
})

describe('onEntitlementsChange', () => {
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

  it('fires the callback with the new snapshot on a local change', () => {
    const listeners = installChrome()
    const cb = vi.fn()
    onEntitlementsChange(cb)
    listeners[0]({ [ENTITLEMENTS_STATE_KEY]: { oldValue: null, newValue: ENT } }, 'local')
    expect(cb).toHaveBeenCalledWith(ENT)
  })

  it('passes null when the snapshot is cleared, and ignores non-local areas', () => {
    const listeners = installChrome()
    const cb = vi.fn()
    onEntitlementsChange(cb)
    listeners[0]({ [ENTITLEMENTS_STATE_KEY]: { oldValue: ENT, newValue: undefined } }, 'local')
    expect(cb).toHaveBeenLastCalledWith(null)
    listeners[0]({ [ENTITLEMENTS_STATE_KEY]: { newValue: ENT } }, 'sync')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes', () => {
    const listeners = installChrome()
    const cb = vi.fn()
    const off = onEntitlementsChange(cb)
    off()
    expect(listeners).toHaveLength(0)
  })
})
