/// <reference types="chrome" />
import { describe, expect, it } from 'vitest'
import type { Entitlements } from '@quikfill/schemas'
import { ENTITLEMENTS_STATE_KEY, createEntitlementsStore } from './entitlements-store'

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
  tokensUsed: 10,
  tokenLimit: 500_000,
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
