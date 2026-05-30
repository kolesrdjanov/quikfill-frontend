import type {
  CreateDomainInput,
  CreateFieldMappingInput,
  CreateFormProfileInput,
  Domain,
  FieldMapping,
  FormProfile,
} from '@quikfill/schemas'
import type { ProfileBundle, ProfileStore } from './profile-store'
import type { PushResult, ReconcileResult, SyncHandlers } from './profile-sync-messaging'

/**
 * The subset of `@quikfill/api-client`'s `ApiClient` the sync engine needs.
 * Declared structurally (like `AuthApi`) so this package keeps its single
 * dependency on `@quikfill/schemas` — the real client satisfies it (its extra
 * optional `signal` params are assignable to these narrower signatures). The
 * `create*` calls forward the client UUID, so the backend upserts on it.
 */
export interface SyncApi {
  domains: {
    list(): Promise<Domain[]>
    create(input: CreateDomainInput): Promise<Domain>
  }
  formProfiles: {
    list(): Promise<FormProfile[]>
    create(input: CreateFormProfileInput): Promise<FormProfile>
    listMappings(formProfileId: string): Promise<FieldMapping[]>
    createMapping(formProfileId: string, input: CreateFieldMappingInput): Promise<FieldMapping>
  }
}

export interface BackgroundSync {
  handlers: SyncHandlers
}

/** A persisted record carries an id and an optional last-write timestamp. */
interface Synced {
  id: string
  updatedAt?: string
}

/** Last-write-wins: is `a` strictly newer than `b`? Missing timestamp = oldest. */
function isNewer(a: Synced, b: Synced): boolean {
  return (a.updatedAt ?? '') > (b.updatedAt ?? '')
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'sync failed'
}

/**
 * Two-way profile sync, owned by the background worker. Pushes saved bundles
 * through to the backend (idempotent upsert on the client UUID) and reconciles
 * the whole account both ways, merging by id with last-write-wins on `updatedAt`.
 * v1 never deletes — a record dropped on one side is not removed from the other.
 */
export function createBackgroundSync({
  api,
  store,
}: {
  api: SyncApi
  store: ProfileStore
}): BackgroundSync {
  /**
   * Merge one entity collection both ways. Remote-newer (or remote-only) is
   * written to local; local-newer (or local-only) is upserted to the backend and
   * the server's echo (with its timestamps) written back so local converges and a
   * later reconcile is a no-op.
   */
  async function merge<T extends Synced>(
    remote: T[],
    local: T[],
    saveLocal: (record: T) => Promise<void>,
    push: (record: T) => Promise<T>,
  ): Promise<{ pushed: number; pulled: number }> {
    const remoteById = new Map(remote.map((r) => [r.id, r]))
    const localById = new Map(local.map((l) => [l.id, l]))
    let pushed = 0
    let pulled = 0
    for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
      const r = remoteById.get(id)
      const l = localById.get(id)
      if (r && l) {
        if (isNewer(r, l)) {
          await saveLocal(r)
          pulled++
        } else if (isNewer(l, r)) {
          await saveLocal(await push(l))
          pushed++
        }
      } else if (r) {
        await saveLocal(r)
        pulled++
      } else if (l) {
        await saveLocal(await push(l))
        pushed++
      }
    }
    return { pushed, pulled }
  }

  /** Write one saved bundle through to the backend (domain → profile → mappings). */
  async function pushBundle(bundle: ProfileBundle): Promise<PushResult> {
    try {
      const domain = await api.domains.create(bundle.domain)
      await store.saveDomain(domain)
      const profile = await api.formProfiles.create(bundle.profile)
      await store.saveFormProfile(profile)
      for (const mapping of bundle.mappings) {
        const saved = await api.formProfiles.createMapping(profile.id, mapping)
        await store.saveMapping(saved)
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  }

  /** Full two-way reconcile: domains → profiles → mappings (FK-safe order). */
  async function reconcile(): Promise<ReconcileResult> {
    try {
      let pushed = 0
      let pulled = 0

      const [remoteDomains, localDomains] = await Promise.all([
        api.domains.list(),
        store.listDomains(),
      ])
      const d = await merge(
        remoteDomains,
        localDomains,
        (record) => store.saveDomain(record),
        (record) => api.domains.create(record),
      )
      pushed += d.pushed
      pulled += d.pulled

      const [remoteProfiles, localProfiles] = await Promise.all([
        api.formProfiles.list(),
        store.listFormProfiles(),
      ])
      const p = await merge(
        remoteProfiles,
        localProfiles,
        (record) => store.saveFormProfile(record),
        (record) => api.formProfiles.create(record),
      )
      pushed += p.pushed
      pulled += p.pulled

      // Re-list so every profile present after the merge (local-kept + pulled)
      // gets its mappings reconciled.
      for (const profile of await store.listFormProfiles()) {
        const [remoteMappings, localMappings] = await Promise.all([
          api.formProfiles.listMappings(profile.id),
          store.listMappings(profile.id),
        ])
        const m = await merge(
          remoteMappings,
          localMappings,
          (record) => store.saveMapping(record),
          (record) => api.formProfiles.createMapping(profile.id, record),
        )
        pushed += m.pushed
        pulled += m.pulled
      }

      return { ok: true, pushed, pulled }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  }

  return { handlers: { pushBundle, reconcile } }
}
