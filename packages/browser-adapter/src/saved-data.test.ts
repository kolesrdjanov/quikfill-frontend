import { describe, it, expect, vi } from 'vitest'
import type { StorageAdapter } from '@quikfill/schemas'
import { createSavedDataService, SAVED_CACHE_MS } from './saved-data'
const a = 'c6b3ce11-cb07-40a4-a786-800000000001',
  b = 'c6b3ce11-cb07-40a4-a786-800000000002'
const typeId = 'c6b3ce11-cb07-40a4-a786-800000000003',
  recordId = 'c6b3ce11-cb07-40a4-a786-800000000004'
function setup() {
  const values = new Map<string, unknown>()
  const storage: StorageAdapter = {
    get: async <T>(k: string) => (values.get(k) ?? null) as T | null,
    set: async (k, v) => {
      values.set(k, v)
    },
    delete: async (k) => {
      values.delete(k)
    },
    list: async (prefix) => [...values.keys()].filter((k) => k.startsWith(prefix)),
  }
  let owner: string | null = a
  const load = vi.fn(async () => ({
    types: [{ id: typeId, name: 'Person', fields: [] }],
    records: [{ id: recordId, entityTypeId: typeId, name: 'Ada', values: {} }],
  }))
  const service = createSavedDataService({
    storage,
    accountId: async () => owner,
    session: async () => (owner ? { userId: owner, load } : null),
  })
  return {
    service,
    values,
    load,
    change: (id: string | null) => {
      owner = id
    },
  }
}
describe('account scoped saved data', () => {
  it('allows a same-account offline cache for 24 hours, then prunes it', async () => {
    const s = setup(),
      library = await s.service.library()
    s.load.mockRejectedValue(new Error('offline'))
    expect(await s.service.selected({ ownerId: a, recordId })).toMatchObject({
      record: { name: 'Ada' },
    })
    s.values.set(`saved-library:${a}`, {
      ...library,
      syncedAt: new Date(Date.now() - SAVED_CACHE_MS - 1).toISOString(),
    })
    await expect(s.service.library()).rejects.toThrow('unavailable')
    await s.service.prune()
    expect(s.values.size).toBe(0)
  })
  it('does not use cached data on permission failure, logout or another account', async () => {
    const s = setup()
    await s.service.library()
    s.load.mockRejectedValue({ status: 401 })
    await expect(s.service.library()).rejects.toEqual({ status: 401 })
    s.change(b)
    await expect(s.service.selected({ ownerId: a, recordId })).rejects.toThrow('current account')
    s.load.mockRejectedValue(new Error('offline'))
    await expect(s.service.library()).rejects.toThrow('unavailable')
    s.change(null)
    await expect(s.service.library()).rejects.toThrow('Sign in')
  })
  it('discards a response arriving after the account changes', async () => {
    const s = setup()
    s.load.mockImplementation(async () => {
      s.change(b)
      return { types: [], records: [] }
    })
    await expect(s.service.library()).rejects.toThrow('Account changed')
    expect(s.values.size).toBe(0)
  })
})
