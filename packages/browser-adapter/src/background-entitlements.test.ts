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
})
