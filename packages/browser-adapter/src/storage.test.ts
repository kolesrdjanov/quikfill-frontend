import { describe, expect, it } from 'vitest'
import { createChromeStorageAdapter } from './storage'

/** Minimal in-memory stand-in for a chrome.storage.StorageArea. */
function fakeArea() {
  const store: Record<string, unknown> = {}
  return {
    store,
    async get(key: string | null) {
      if (key === null) return { ...store }
      return key in store ? { [key]: store[key] } : {}
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items)
    },
    async remove(key: string) {
      delete store[key]
    },
  }
}

describe('createChromeStorageAdapter', () => {
  it('round-trips values and returns null for missing keys', async () => {
    const area = fakeArea()
    const adapter = createChromeStorageAdapter(area as unknown as chrome.storage.StorageArea)

    expect(await adapter.get('missing')).toBeNull()
    await adapter.set('profile:1', { name: 'Acme' })
    expect(await adapter.get('profile:1')).toEqual({ name: 'Acme' })
  })

  it('lists keys by prefix and deletes', async () => {
    const area = fakeArea()
    const adapter = createChromeStorageAdapter(area as unknown as chrome.storage.StorageArea)

    await adapter.set('profile:1', 1)
    await adapter.set('profile:2', 2)
    await adapter.set('record:1', 3)
    expect((await adapter.list('profile:')).sort()).toEqual(['profile:1', 'profile:2'])

    await adapter.delete('profile:1')
    expect(await adapter.get('profile:1')).toBeNull()
    expect(await adapter.list('profile:')).toEqual(['profile:2'])
  })
})
