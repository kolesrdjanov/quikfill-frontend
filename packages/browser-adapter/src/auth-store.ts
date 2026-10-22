/// <reference types="chrome" />
import type { AuthState } from '@quikfill/schemas'

/**
 * Owns the extension session in `chrome.storage.local`: the access/refresh
 * tokens (read/written only by the background worker) and a *token-free* state
 * snapshot the surfaces read to render the UI. `localStorage` is unavailable in
 * MV3 service workers, so this is the extension analogue of the dashboard's
 * `authTokens` module. Never use `chrome.storage.sync` for tokens.
 */
const TOKENS_KEY = 'auth:tokens'
const STATE_KEY = 'auth:state'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  userId?: string
  user?: { id: string }
}

export interface AuthStore {
  readSession?(): Promise<{ accessToken: string; userId: string } | null>
  getAccess(): Promise<string | undefined>
  getRefresh(): Promise<string | undefined>
  hasSession(): Promise<boolean>
  setTokens(tokens: StoredTokens): Promise<void>
  clearTokens(): Promise<void>
  /** The token-free snapshot surfaces read; `null` until first written. */
  readState(): Promise<AuthState | null>
  writeState(state: AuthState): Promise<void>
}

export function createAuthStore(area: chrome.storage.StorageArea): AuthStore {
  async function tokens(): Promise<StoredTokens | undefined> {
    const result = await area.get(TOKENS_KEY)
    return (result[TOKENS_KEY] as StoredTokens) ?? undefined
  }

  return {
    async readSession() {
      const current = await tokens()
      return current?.userId ? { accessToken: current.accessToken, userId: current.userId } : null
    },
    async getAccess() {
      return (await tokens())?.accessToken
    },
    async getRefresh() {
      return (await tokens())?.refreshToken
    },
    async hasSession() {
      return (await tokens()) !== undefined
    },
    async setTokens(next) {
      // Persist tokens and their owner — never the surrounding `AuthTokens` (which
      // carries the user) into the secret store.
      await area.set({
        [TOKENS_KEY]: {
          accessToken: next.accessToken,
          refreshToken: next.refreshToken,
          ...(next.user?.id || next.userId ? { userId: next.user?.id ?? next.userId } : {}),
        },
      })
    },
    async clearTokens() {
      await area.remove(TOKENS_KEY)
    },
    async readState() {
      const result = await area.get(STATE_KEY)
      return (result[STATE_KEY] as AuthState) ?? null
    },
    async writeState(state) {
      await area.set({ [STATE_KEY]: state })
    },
  }
}

/** The default store, backed by `chrome.storage.local`. */
export function createChromeAuthStore(): AuthStore {
  return createAuthStore(chrome.storage.local)
}

/** The storage key surfaces watch via `chrome.storage.onChanged` for live updates. */
export const AUTH_STATE_KEY = STATE_KEY
