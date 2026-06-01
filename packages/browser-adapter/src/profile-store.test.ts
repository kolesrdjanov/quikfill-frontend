import { describe, expect, it } from 'vitest'
import type { Domain, FieldMapping, FormProfile, StorageAdapter } from '@quikfill/schemas'
import { createProfileStore } from './profile-store'

/** In-memory StorageAdapter for tests. */
function memoryAdapter(): StorageAdapter {
  const store = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return (store.get(key) as T) ?? null
    },
    async set<T>(key: string, value: T) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(prefix: string) {
      return [...store.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}

const DOMAIN: Domain = { id: 'd1', name: 'Acme', hostnames: ['acme.com'] }
const PROFILE: FormProfile = {
  id: 'p1',
  domainId: 'd1',
  name: 'Signup',
  urlPatterns: ['https://acme.com/*'],
  pageTitlePatterns: [],
}
const mapping = (id: string): FieldMapping => ({
  id,
  formProfileId: 'p1',
  fieldFingerprint: `fp-${id}`,
  selectorCandidates: [],
  target: { fieldFingerprint: `fp-${id}`, selectorCandidates: [], frame: 'main', shadow: false },
  fillSource: { sourceType: 'staticValue', value: 'x' },
  fillStrategy: 'nativeInput',
  confidence: 0.5,
})

describe('createProfileStore', () => {
  it('round-trips a bundle (domain + profile + mappings)', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveBundle({
      domain: DOMAIN,
      profile: PROFILE,
      mappings: [mapping('m1'), mapping('m2')],
    })

    expect(await store.getDomain('d1')).toEqual(DOMAIN)
    expect(await store.getFormProfile('p1')).toEqual(PROFILE)
    expect((await store.listDomains()).map((d) => d.id)).toEqual(['d1'])
    expect((await store.listMappings('p1')).map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('scopes mapping listing to a profile', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveMapping(mapping('m1'))
    await store.saveMapping({ ...mapping('m2'), formProfileId: 'other' })
    expect((await store.listMappings('p1')).map((m) => m.id)).toEqual(['m1'])
  })

  it('touches a mapping with success metadata', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveMapping(mapping('m1'))
    await store.touchMapping('p1', 'm1', {
      confidence: 0.9,
      lastSuccessfulFillAt: '2026-05-29T00:00:00.000Z',
    })
    const [m] = await store.listMappings('p1')
    expect(m.confidence).toBe(0.9)
    expect(m.lastSuccessfulFillAt).toBe('2026-05-29T00:00:00.000Z')
  })

  it('bumps updatedAt on touch so the change is last-write-wins comparable', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveMapping({ ...mapping('m1'), updatedAt: '2020-01-01T00:00:00.000Z' })
    await store.touchMapping('p1', 'm1', {
      confidence: 0.9,
      lastSuccessfulFillAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    })
    const [m] = await store.listMappings('p1')
    // Without this, sync (isNewer) never pushes the bump and a remote pull clobbers it.
    expect(m.updatedAt).toBe('2026-05-29T00:00:00.000Z')
  })

  it('defaults updatedAt to now when a touch omits it', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveMapping({ ...mapping('m1'), updatedAt: '2020-01-01T00:00:00.000Z' })
    await store.touchMapping('p1', 'm1', { confidence: 0.7 })
    const [m] = await store.listMappings('p1')
    expect(m.updatedAt).toBeDefined()
    expect(m.updatedAt! > '2020-01-01T00:00:00.000Z').toBe(true)
  })

  it('deletes a mapping', async () => {
    const store = createProfileStore(memoryAdapter())
    await store.saveMapping(mapping('m1'))
    await store.deleteMapping('p1', 'm1')
    expect(await store.listMappings('p1')).toEqual([])
  })

  it('heals a legacy mapping whose selectors were stored as an object', async () => {
    const adapter = memoryAdapter()
    const store = createProfileStore(adapter)
    // A past write left selectorCandidates as a numeric-keyed object (top-level
    // and inside target) — reconcile/matching expect a string[].
    await adapter.set('mapping:p1:m1', {
      ...mapping('m1'),
      selectorCandidates: { 0: '#a', 1: '#b' },
      target: {
        fieldFingerprint: 'fp-m1',
        selectorCandidates: { 0: '#a' },
        frame: 'main',
        shadow: false,
      },
    })

    const [m] = await store.listMappings('p1')
    expect(m.selectorCandidates).toEqual(['#a', '#b'])
    expect(m.target.selectorCandidates).toEqual(['#a'])
  })
})
