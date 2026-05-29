import type { Domain, FieldMapping, FormProfile, StorageAdapter } from '@quikfill/schemas'

const KEY = {
  domain: (id: string) => `domain:${id}`,
  profile: (id: string) => `formProfile:${id}`,
  mapping: (profileId: string, id: string) => `mapping:${profileId}:${id}`,
  domainPrefix: 'domain:',
  profilePrefix: 'formProfile:',
  mappingPrefix: (profileId: string) => `mapping:${profileId}:`,
}

/** One domain + form profile + its field mappings, saved/loaded together. */
export interface ProfileBundle {
  domain: Domain
  profile: FormProfile
  mappings: FieldMapping[]
}

/**
 * Local-first repository for domains, form profiles, and field mappings over any
 * StorageAdapter. Browser-agnostic: the chrome.storage adapter is injected, so
 * this is fully testable with an in-memory adapter and unchanged when backend
 * sync swaps the adapter later.
 */
export function createProfileStore(adapter: StorageAdapter) {
  async function getAll<T>(keys: string[]): Promise<T[]> {
    const values = await Promise.all(keys.map((k) => adapter.get<T>(k)))
    // Promise.all widens an unconstrained T to Awaited<T>, so a `v is T` predicate
    // won't type-check; assert after dropping nulls (get<T> is declared T | null).
    return values.filter((v) => v !== null) as T[]
  }

  return {
    async saveDomain(domain: Domain): Promise<void> {
      await adapter.set(KEY.domain(domain.id), domain)
    },
    getDomain(id: string): Promise<Domain | null> {
      return adapter.get<Domain>(KEY.domain(id))
    },
    async listDomains(): Promise<Domain[]> {
      return getAll<Domain>(await adapter.list(KEY.domainPrefix))
    },

    async saveFormProfile(profile: FormProfile): Promise<void> {
      await adapter.set(KEY.profile(profile.id), profile)
    },
    getFormProfile(id: string): Promise<FormProfile | null> {
      return adapter.get<FormProfile>(KEY.profile(id))
    },
    async listFormProfiles(): Promise<FormProfile[]> {
      return getAll<FormProfile>(await adapter.list(KEY.profilePrefix))
    },

    async saveMapping(mapping: FieldMapping): Promise<void> {
      await adapter.set(KEY.mapping(mapping.formProfileId, mapping.id), mapping)
    },
    async listMappings(profileId: string): Promise<FieldMapping[]> {
      return getAll<FieldMapping>(await adapter.list(KEY.mappingPrefix(profileId)))
    },
    async deleteMapping(profileId: string, mappingId: string): Promise<void> {
      await adapter.delete(KEY.mapping(profileId, mappingId))
    },

    /** Save a domain, its profile, and all mappings in one call. */
    async saveBundle(bundle: ProfileBundle): Promise<void> {
      await adapter.set(KEY.domain(bundle.domain.id), bundle.domain)
      await adapter.set(KEY.profile(bundle.profile.id), bundle.profile)
      await Promise.all(
        bundle.mappings.map((m) => adapter.set(KEY.mapping(m.formProfileId, m.id), m)),
      )
    },

    /** Patch a mapping's success metadata (e.g. after a successful fill). */
    async touchMapping(
      profileId: string,
      mappingId: string,
      patch: { lastSuccessfulFillAt?: string; confidence?: number },
    ): Promise<void> {
      const existing = await adapter.get<FieldMapping>(KEY.mapping(profileId, mappingId))
      if (!existing) return
      await adapter.set(KEY.mapping(profileId, mappingId), { ...existing, ...patch })
    },
  }
}

export type ProfileStore = ReturnType<typeof createProfileStore>
