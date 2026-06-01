import { describe, expect, it, vi } from 'vitest'
import type { Entitlements } from '@quikfill/schemas'
import { createBackgroundEntitlements } from './background-entitlements'
import type { EntitlementsStore } from './entitlements-store'

const ENT: Entitlements = {
  planKey: 'pro',
  displayName: 'Pro Tester',
  status: 'active',
  tokensUsed: 5,
  tokenLimit: 2_000_000,
}

function memoryStore(seed: Entitlements | null = null): EntitlementsStore {
  let value = seed
  return {
    read: async () => value,
    write: async (e) => {
      value = e
    },
    clear: async () => {
      value = null
    },
  }
}

describe('createBackgroundEntitlements', () => {
  it('refresh fetches, caches, and writes through to the store', async () => {
    const store = memoryStore()
    const api = { subscriptions: { entitlements: vi.fn().mockResolvedValue(ENT) } }
    const owner = createBackgroundEntitlements({ api, store })

    expect(await owner.refresh()).toEqual(ENT)
    expect(await store.read()).toEqual(ENT)
  })

  it('get returns the persisted snapshot without a fetch', async () => {
    const store = memoryStore(ENT)
    const entitlements = vi.fn().mockResolvedValue(ENT)
    const owner = createBackgroundEntitlements({ api: { subscriptions: { entitlements } }, store })

    expect(await owner.handlers.get()).toEqual(ENT)
    expect(entitlements).not.toHaveBeenCalled()
  })

  it('refresh keeps the last-known snapshot when the API fails', async () => {
    const store = memoryStore(ENT)
    const entitlements = vi.fn().mockRejectedValue(new Error('offline'))
    const owner = createBackgroundEntitlements({ api: { subscriptions: { entitlements } }, store })

    await owner.handlers.get() // hydrate cache from store
    expect(await owner.refresh()).toEqual(ENT)
  })

  it('clear drops the cached snapshot', async () => {
    const store = memoryStore(ENT)
    const owner = createBackgroundEntitlements({
      api: { subscriptions: { entitlements: vi.fn() } },
      store,
    })
    await owner.clear()
    expect(await store.read()).toBeNull()
  })

  it('does NOT auto-refresh when signed out and there is no snapshot', async () => {
    const store = memoryStore() // empty
    const entitlements = vi.fn().mockResolvedValue(ENT)
    const owner = createBackgroundEntitlements({
      api: { subscriptions: { entitlements } },
      store,
      isSignedIn: () => false,
    })

    expect(await owner.handlers.get()).toBeNull()
    await new Promise((r) => setTimeout(r, 0)) // let any (unwanted) fetch settle
    // The /entitlements call is authenticated: firing it signed-out would 401 and
    // falsely trip "session expired" (see useAuthGate). It must not be called.
    expect(entitlements).not.toHaveBeenCalled()
  })

  it('auto-warms in the background when signed in and there is no snapshot', async () => {
    const store = memoryStore() // empty
    const entitlements = vi.fn().mockResolvedValue(ENT)
    const owner = createBackgroundEntitlements({
      api: { subscriptions: { entitlements } },
      store,
      isSignedIn: () => true,
    })

    expect(await owner.handlers.get()).toBeNull() // returns immediately; warms async
    await new Promise((r) => setTimeout(r, 0))
    expect(entitlements).toHaveBeenCalledTimes(1)
    expect(await store.read()).toEqual(ENT)
  })
})
