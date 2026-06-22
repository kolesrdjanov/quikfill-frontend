import type { Entitlements } from '@quikfill/schemas'
import type { EntitlementsHandlers } from './entitlements-messaging'
import type { EntitlementsStore } from './entitlements-store'

/**
 * The subset of `@quikfill/api-client`'s `ApiClient` the background entitlements
 * owner needs. Declared structurally so this package keeps its single dependency
 * (`@quikfill/schemas`) — the real client satisfies it.
 */
export interface EntitlementsApi {
  subscriptions: {
    entitlements(): Promise<Entitlements>
  }
}

export interface BackgroundEntitlements {
  /** Handlers to register with {@link onEntitlementsRequest}. */
  handlers: EntitlementsHandlers
  /** Fetch fresh entitlements and broadcast; call on sign-in and panel open. */
  refresh(): Promise<Entitlements | null>
  /** Drop the cached snapshot (e.g. on sign-out). */
  clear(): Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'refresh failed'
}

/**
 * Background-only owner of the entitlements snapshot. Fetches via the injected
 * api client, caches through {@link EntitlementsStore} (which every surface
 * watches), and answers surface `get` / `refresh` requests. A failed refresh
 * keeps the last-known snapshot so a transient offline blip never wrongly gates
 * AI. Mirrors `createBackgroundAuth`.
 */
export function createBackgroundEntitlements({
  api,
  store,
  isSignedIn,
}: {
  api: EntitlementsApi
  store: EntitlementsStore
  /**
   * Whether a session exists. `get()`'s auto-warm hits the AUTHENTICATED
   * `/entitlements` endpoint, so without this a signed-out surface (the content
   * overlay fires on every page load) would 401 and flip auth into a false
   * "session expired". Omitted → always warm (legacy / tests); `background.ts`
   * wires it to the real session.
   */
  isSignedIn?: () => boolean | Promise<boolean>
}): BackgroundEntitlements {
  let cached: Entitlements | null = null
  let hydrated = false

  async function get(): Promise<Entitlements | null> {
    if (!hydrated) {
      cached = await store.read()
      hydrated = true
      // No snapshot yet (fresh sign-in / new install): warm it in the background
      // so the surface picks it up via storage.onChanged — but only when signed
      // in. The fetch is authenticated, so firing it while signed out 401s and
      // would wrongly trip the "session expired" path (see useAuthGate).
      if (!cached && (isSignedIn ? await isSignedIn() : true)) void refresh()
    }
    return cached
  }

  async function refresh(): Promise<Entitlements | null> {
    try {
      const entitlements = await api.subscriptions.entitlements()
      cached = entitlements
      hydrated = true
      await store.write(entitlements)
      return entitlements
    } catch (error) {
      // Surface the swallowed failure so a hard contract/parse mismatch (e.g. a
      // stale build bundling a renamed usage field) is diagnosable in the SW
      // devtools instead of silently presenting as an eternal "Loading…". We still
      // return the last-known snapshot so a transient blip (offline / 5xx) never
      // wrongly gates AI — entitlements is an optimistic, display-only signal.
      console.warn('[quikfill] entitlements: refresh failed', errorMessage(error))
      return cached
    }
  }

  async function clear(): Promise<void> {
    cached = null
    hydrated = true
    await store.clear()
  }

  return { handlers: { get, refresh }, refresh, clear }
}
