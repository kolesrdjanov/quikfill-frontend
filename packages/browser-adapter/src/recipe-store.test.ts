import { describe, expect, it } from 'vitest'
import { recipeSchema, type StorageAdapter } from '@quikfill/schemas'
import { createRecipeStore } from './recipe-store'
const sample = () =>
  recipeSchema.parse({
    version: 1,
    engineVersion: 1,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'QA',
    origin: 'https://example.com',
    pathname: '/form',
    formKey: 'shape',
    seed: 'seed',
    locale: 'en-US',
    rules: [{ fieldKey: 'email', label: 'Email', mode: 'generated' }],
  })
function setup() {
  const data = new Map<string, unknown>()
  const storage: StorageAdapter = {
    get: async <T>(key: string) => (data.get(key) ?? null) as T | null,
    set: async (key, value) => {
      data.set(key, value)
    },
    delete: async (key) => {
      data.delete(key)
    },
    list: async (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  }
  return { data, store: createRecipeStore(storage) }
}
describe('device-local recipes', () => {
  it('persists, activates by exact context, deactivates and deletes', async () => {
    const { store } = setup()
    const r = sample()
    await store.save(r)
    await store.activate(r, r.id)
    expect(await store.active(r)).toEqual(r)
    expect(await store.active({ ...r, formKey: 'foreign' })).toBeNull()
    await expect(store.activate({ ...r, pathname: '/foreign' }, r.id)).rejects.toThrow()
    await store.activate(r, null)
    expect(await store.active(r)).toBeNull()
    await store.remove(r.id)
    expect(await store.list()).toEqual([])
  })
  it('imports validated copies without overwriting or auto-activating', async () => {
    const { store } = setup()
    const r = sample()
    await store.save(r)
    const [copy] = await store.import(store.export([r]))
    expect(copy.id).not.toBe(r.id)
    expect(copy.seed).toBe(r.seed)
    expect(await store.list()).toHaveLength(2)
    expect(await store.active(copy)).toBeNull()
    await expect(store.import('{"format":"other"}')).rejects.toThrow()
    await expect(store.import('x'.repeat(1000001))).rejects.toThrow()
    expect(await store.list()).toHaveLength(2)
  })
  it('does not trust corrupted stored recipes', async () => {
    const { store, data } = setup()
    data.set('qa-recipe:bad', { version: 99 })
    expect(await store.list()).toEqual([])
  })
})
