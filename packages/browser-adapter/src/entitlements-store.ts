/// <reference types="chrome" />
import type { Entitlements } from '@quikfill/schemas'

/**
 * Caches the user's live entitlements (`GET /entitlements`) in
 * `chrome.storage.local` so every surface (side panel, popup) can read the plan
 * + usage without its own API call, and stay in sync via `storage.onChanged`.
 * The background worker is the only writer; surfaces only read. Mirrors the
 * auth-state snapshot in `auth-store.ts`.
 */
const STATE_KEY = 'entitlements:current'

export interface EntitlementsStore {
  /** The last-known entitlements snapshot, or `null` until first written. */
  read(): Promise<Entitlements | null>
  write(entitlements: Entitlements): Promise<void>
  clear(): Promise<void>
}

export function createEntitlementsStore(area: chrome.storage.StorageArea): EntitlementsStore {
  return {
    async read() {
      const result = await area.get(STATE_KEY)
      return (result[STATE_KEY] as Entitlements) ?? null
    },
    async write(entitlements) {
      await area.set({ [STATE_KEY]: entitlements })
    },
    async clear() {
      await area.remove(STATE_KEY)
    },
  }
}

/** The default store, backed by `chrome.storage.local`. */
export function createChromeEntitlementsStore(): EntitlementsStore {
  return createEntitlementsStore(chrome.storage.local)
}

/** The storage key surfaces watch via `chrome.storage.onChanged` for live updates. */
export const ENTITLEMENTS_STATE_KEY = STATE_KEY

/**
 * Subscribe to entitlements-snapshot changes (the background is the only writer),
 * so any reader — surface or content script — reacts live to a plan change, a
 * usage bump, or a monthly reset. Returns an unsubscribe function. Keeps the
 * `chrome.storage` dependency inside the adapter, per the repo's layering rule.
 */
export function onEntitlementsChange(
  callback: (entitlements: Entitlements | null) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local') return
    const change = changes[STATE_KEY]
    if (change) callback((change.newValue as Entitlements | undefined) ?? null)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
