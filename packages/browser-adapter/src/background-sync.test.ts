import { describe, expect, it } from 'vitest'
import type { Domain, FieldMapping, FormProfile, StorageAdapter } from '@quikfill/schemas'
import { createProfileStore } from './profile-store'
import { createBackgroundSync, type SyncApi } from './background-sync'

/** In-memory StorageAdapter (mirrors profile-store.test). */
function memoryAdapter(): StorageAdapter {
  const data = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return (data.get(key) as T) ?? null
    },
    async set<T>(key: string, value: T) {
      data.set(key, value)
    },
    async delete(key: string) {
      data.delete(key)
    },
    async list(prefix: string) {
      return [...data.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}

// The backend stamps `updatedAt = now`, which is always the newest moment — so a
// push always wins the next comparison. A fixed far-future value models that.
const SERVER_NOW = '2099-01-01T00:00:00.000Z'
const OLD = '2026-01-01T00:00:00.000Z'
const NEW = '2026-06-01T00:00:00.000Z'

/** In-memory backend with upsert-on-id create semantics. */
function fakeBackend() {
  const domains = new Map<string, Domain>()
  const profiles = new Map<string, FormProfile>()
  const mappings = new Map<string, FieldMapping>()
  let auto = 0
  const api: SyncApi = {
    domains: {
      list: async () => [...domains.values()],
      create: async (input) => {
        const id = input.id ?? `srv-d${auto++}`
        const rec = { ...input, id, updatedAt: SERVER_NOW } as Domain
        domains.set(id, rec)
        return rec
      },
    },
    formProfiles: {
      list: async () => [...profiles.values()],
      create: async (input) => {
        const id = input.id ?? `srv-p${auto++}`
        const rec = { ...input, id, updatedAt: SERVER_NOW } as FormProfile
        profiles.set(id, rec)
        return rec
      },
      listMappings: async (fp) => [...mappings.values()].filter((m) => m.formProfileId === fp),
      createMapping: async (fp, input) => {
        const id = input.id ?? `srv-m${auto++}`
        const rec = { ...input, id, formProfileId: fp, updatedAt: SERVER_NOW } as FieldMapping
        mappings.set(id, rec)
        return rec
      },
    },
  }
  return { api, domains, profiles, mappings }
}

const domain = (id: string, name: string, updatedAt?: string): Domain => ({
  id,
  name,
  hostnames: [`${name}.com`],
  ...(updatedAt ? { updatedAt } : {}),
})
const profile = (id: string, name: string, updatedAt?: string): FormProfile => ({
  id,
  domainId: 'd1',
  name,
  urlPatterns: [],
  pageTitlePatterns: [],
  ...(updatedAt ? { updatedAt } : {}),
})
const mapping = (id: string, updatedAt?: string): FieldMapping => ({
  id,
  formProfileId: 'p1',
  fieldFingerprint: `fp-${id}`,
  selectorCandidates: [],
  target: { fieldFingerprint: `fp-${id}`, selectorCandidates: [], frame: 'main', shadow: false },
  fillSource: { sourceType: 'staticValue', value: 'x' },
  fillStrategy: 'nativeInput',
  confidence: 0.5,
  ...(updatedAt ? { updatedAt } : {}),
})

describe('createBackgroundSync — pushBundle', () => {
  it('upserts the whole bundle to the backend and echoes it back to local', async () => {
    const { api, domains, profiles, mappings } = fakeBackend()
    const store = createProfileStore(memoryAdapter())
    const sync = createBackgroundSync({ api, store })

    const result = await sync.handlers.pushBundle({
      domain: domain('d1', 'acme'),
      profile: profile('p1', 'signup'),
      mappings: [mapping('m1'), mapping('m2')],
    })

    expect(result).toEqual({ ok: true })
    expect(domains.get('d1')?.name).toBe('acme')
    expect(profiles.get('p1')?.name).toBe('signup')
    expect([...mappings.keys()].sort()).toEqual(['m1', 'm2'])
    // Local now carries the server timestamp, so a later reconcile is a no-op.
    expect((await store.getDomain('d1'))?.updatedAt).toBe(SERVER_NOW)
  })

  it('reports a failure without throwing when the backend rejects', async () => {
    const { api } = fakeBackend()
    api.domains.create = async () => {
      throw new Error('boom')
    }
    const store = createProfileStore(memoryAdapter())
    const sync = createBackgroundSync({ api, store })
    expect(
      await sync.handlers.pushBundle({
        domain: domain('d1', 'acme'),
        profile: profile('p1', 'signup'),
        mappings: [],
      }),
    ).toEqual({ ok: false, error: 'boom' })
  })
})

describe('createBackgroundSync — reconcile', () => {
  it('pushes local-only records to the backend', async () => {
    const { api, domains, profiles, mappings } = fakeBackend()
    const store = createProfileStore(memoryAdapter())
    await store.saveBundle({
      domain: domain('d1', 'acme', OLD),
      profile: profile('p1', 'signup', OLD),
      mappings: [mapping('m1', OLD)],
    })

    const result = await createBackgroundSync({ api, store }).handlers.reconcile()

    expect(result).toEqual({ ok: true, pushed: 3, pulled: 0 })
    expect(domains.has('d1')).toBe(true)
    expect(profiles.has('p1')).toBe(true)
    expect(mappings.has('m1')).toBe(true)
  })

  it('pulls remote-only records into local storage', async () => {
    const { api } = fakeBackend()
    await api.domains.create(domain('d1', 'acme'))
    await api.formProfiles.create(profile('p1', 'signup'))
    await api.formProfiles.createMapping('p1', mapping('m1'))
    const store = createProfileStore(memoryAdapter())

    const result = await createBackgroundSync({ api, store }).handlers.reconcile()

    expect(result).toEqual({ ok: true, pushed: 0, pulled: 3 })
    expect((await store.getDomain('d1'))?.name).toBe('acme')
    expect((await store.listMappings('p1')).map((m) => m.id)).toEqual(['m1'])
  })

  it('lets the remote win when it is newer (last-write-wins)', async () => {
    const { api, domains } = fakeBackend()
    domains.set('d1', domain('d1', 'remote-name', NEW))
    const store = createProfileStore(memoryAdapter())
    await store.saveDomain(domain('d1', 'local-name', OLD))

    await createBackgroundSync({ api, store }).handlers.reconcile()

    expect((await store.getDomain('d1'))?.name).toBe('remote-name')
  })

  it('lets local win when it is newer, pushing it to the backend', async () => {
    const { api, domains } = fakeBackend()
    domains.set('d1', domain('d1', 'remote-name', OLD))
    const store = createProfileStore(memoryAdapter())
    await store.saveDomain(domain('d1', 'local-name', NEW))

    await createBackgroundSync({ api, store }).handlers.reconcile()

    expect(domains.get('d1')?.name).toBe('local-name')
  })

  it('converges — a second reconcile moves nothing', async () => {
    const { api } = fakeBackend()
    const store = createProfileStore(memoryAdapter())
    await store.saveBundle({
      domain: domain('d1', 'acme', OLD),
      profile: profile('p1', 'signup', OLD),
      mappings: [mapping('m1', OLD)],
    })
    const sync = createBackgroundSync({ api, store })

    await sync.handlers.reconcile()
    expect(await sync.handlers.reconcile()).toEqual({ ok: true, pushed: 0, pulled: 0 })
  })

  it('reports a failure without throwing when a list call rejects', async () => {
    const { api } = fakeBackend()
    api.domains.list = async () => {
      throw new Error('offline')
    }
    const store = createProfileStore(memoryAdapter())
    expect(await createBackgroundSync({ api, store }).handlers.reconcile()).toEqual({
      ok: false,
      error: 'offline',
    })
  })
})
