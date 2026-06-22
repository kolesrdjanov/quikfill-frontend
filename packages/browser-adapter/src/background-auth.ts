import { authErrorKind, type AuthState, type AuthTokens, type UserAccount } from '@quikfill/schemas'
import type { AuthHandlers, RequestCodeResponse, VerifyResponse } from './auth-messaging'
import type { AuthStore } from './auth-store'

/**
 * The subset of `@quikfill/api-client`'s `ApiClient` the background auth manager
 * needs. Declared structurally so this package keeps its single dependency
 * (`@quikfill/schemas`) — the real client satisfies it.
 */
export interface AuthApi {
  auth: {
    requestMagicLink(email: string): Promise<{ devCode?: string }>
    verify(email: string, code: string): Promise<AuthTokens>
    refresh(refreshToken: string): Promise<AuthTokens>
    logout(refreshToken: string): Promise<void>
    redeemHandoff(code: string): Promise<AuthTokens>
  }
  users: {
    me(): Promise<UserAccount>
  }
}

export interface BackgroundAuth {
  /** Auth action handlers to register with {@link onAuthRequest}. */
  handlers: AuthHandlers
  /** `RestClientConfig.refreshAuth` — rotate the refresh token, return the new access token. */
  refreshAuth(): Promise<string | undefined>
  /** `RestClientConfig.onAuthError` — refresh was unrecoverable; force sign-out. */
  onAuthError(): Promise<void>
}

/** Read an HTTP status off a thrown api-client error, if present. */
function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
}

/**
 * Classify a failure from the *public* auth endpoints (`/auth/magic-link`,
 * `/auth/verify`). These have no session, so a 401 (the backend's uniform
 * `INVALID_TOKEN` for wrong/expired/unknown codes) means "bad code", not a dead
 * session — surface it as `invalid-code`. A genuine `unauthorized` only comes
 * from authenticated requests / a failed refresh (see {@link createBackgroundAuth}'s
 * `onAuthError`). Quota / payment / unavailable / network pass through unchanged.
 */
function endpointErrorKind(error: unknown) {
  const kind = authErrorKind(statusOf(error))
  return kind === 'unauthorized' ? 'invalid-code' : kind
}

/**
 * The single owner of the extension session. Lives in the background worker:
 * performs auth via the injected api client, persists tokens + a token-free
 * state snapshot through {@link AuthStore}, and exposes the `refreshAuth` /
 * `onAuthError` hooks the api client calls. Every transition rewrites the
 * snapshot so all surfaces (watching `chrome.storage.onChanged`) stay in sync.
 */
export function createBackgroundAuth({
  api,
  store,
}: {
  api: AuthApi
  store: AuthStore
}): BackgroundAuth {
  let state: AuthState = { status: 'loading' }
  let hydrated = false
  let hydrating: Promise<void> | undefined

  async function setState(next: AuthState): Promise<AuthState> {
    state = next
    await store.writeState(next)
    return next
  }

  /**
   * Resolve the initial state from persisted tokens exactly once. Concurrent
   * callers share the in-flight promise and the single `users.me()` fetch — the
   * worker fires an eager `getState()` the instant a surface wakes it, which
   * races that surface's own request; without coalescing the second caller would
   * skip the await and read the `loading` seed, leaving the panel stuck.
   */
  function hydrate(): Promise<void> {
    if (hydrated) return Promise.resolve()
    return (hydrating ??= (async () => {
      if (!(await store.hasSession())) {
        await setState({ status: 'signed-out' })
      } else {
        try {
          const user = await api.users.me()
          await setState({ status: 'signed-in', user })
        } catch {
          await store.clearTokens()
          await setState({ status: 'signed-out' })
        }
      }
      hydrated = true
      hydrating = undefined
    })())
  }

  async function getState(): Promise<AuthState> {
    await hydrate()
    return state
  }

  async function requestCode(email: string): Promise<RequestCodeResponse> {
    try {
      const { devCode } = await api.auth.requestMagicLink(email)
      await setState({ status: 'code-sent', pendingEmail: email })
      return { ok: true, devCode }
    } catch (error) {
      const kind = endpointErrorKind(error)
      await setState({ status: 'error', error: kind })
      return { ok: false, error: kind }
    }
  }

  async function verify(email: string, code: string): Promise<VerifyResponse> {
    try {
      const tokens = await api.auth.verify(email, code)
      await store.setTokens(tokens)
      hydrated = true
      const next = await setState({ status: 'signed-in', user: tokens.user })
      return { ok: true, state: next }
    } catch (error) {
      const kind = endpointErrorKind(error)
      await setState({ status: 'error', error: kind })
      return { ok: false, error: kind }
    }
  }

  /**
   * Adopt a session handed off from the web app by redeeming a one-time code for
   * this surface's OWN session (mirrors `verify`). Best-effort: a failed/expired/
   * raced code is reported but must NOT flip a signed-out surface into an error
   * state — the next app visit re-bootstraps it.
   */
  async function adoptHandoff(code: string): Promise<VerifyResponse> {
    try {
      const tokens = await api.auth.redeemHandoff(code)
      await store.setTokens(tokens)
      hydrated = true
      const next = await setState({ status: 'signed-in', user: tokens.user })
      return { ok: true, state: next }
    } catch (error) {
      return { ok: false, error: endpointErrorKind(error) }
    }
  }

  async function logout(): Promise<{ ok: true }> {
    const refresh = await store.getRefresh()
    if (refresh) {
      try {
        await api.auth.logout(refresh)
      } catch {
        // Best-effort revoke: clear locally regardless.
      }
    }
    await store.clearTokens()
    hydrated = true
    await setState({ status: 'signed-out' })
    return { ok: true }
  }

  async function refreshAuth(): Promise<string | undefined> {
    const refresh = await store.getRefresh()
    if (!refresh) return undefined
    try {
      const tokens = await api.auth.refresh(refresh)
      await store.setTokens(tokens)
      return tokens.accessToken
    } catch {
      await store.clearTokens()
      return undefined
    }
  }

  async function onAuthError(): Promise<void> {
    await store.clearTokens()
    hydrated = true
    await setState({ status: 'error', error: 'unauthorized' })
  }

  return {
    handlers: { getState, requestCode, verify, logout, adoptHandoff },
    refreshAuth,
    onAuthError,
  }
}
