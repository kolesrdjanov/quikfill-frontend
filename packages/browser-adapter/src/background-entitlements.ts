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
}: {
  api: EntitlementsApi
  store: EntitlementsStore
}): BackgroundEntitlements {
  let cached: Entitlements | null = null
  let hydrated = false

  async function get(): Promise<Entitlements | null> {
    if (!hydrated) {
      cached = await store.read()
      hydrated = true
      // No snapshot yet (fresh sign-in / new install): kick a best-effort fetch
      // in the background; the surface will pick it up via storage.onChanged.
      if (!cached) void refresh()
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
    } catch {
      // Keep the last-known snapshot on a transient failure (offline / 5xx).
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
