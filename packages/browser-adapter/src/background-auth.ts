import {
  pendingAuthStateSchema,
  authErrorKind,
  type AuthState,
  type AuthTokens,
  type UserAccount,
} from '@quikfill/schemas'
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
  let revision = 0
  let writes = Promise.resolve()
  let refreshing: Promise<string | undefined> | null = null
  function commit(start: number, action: () => Promise<void>): Promise<void> {
    const next = writes.then(async () => {
      if (revision === start) await action()
    })
    writes = next.catch(() => {})
    return next
  }
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
      const start = revision
      if (!(await store.hasSession())) {
        await commit(start, async () => {
          const pending = pendingAuthStateSchema.safeParse(await store.readState())
          await setState(pending.success ? pending.data : { status: 'signed-out' })
        })
      } else {
        try {
          const user = await api.users.me()
          if (revision === start) {
            await commit(start, async () => {
              const accessToken = await store.getAccess(),
                refreshToken = await store.getRefresh()
              if (revision !== start) return
              if (accessToken && refreshToken)
                await store.setTokens({ accessToken, refreshToken, user })
              await setState({ status: 'signed-in', user })
            })
          }
        } catch (error) {
          if (revision === start) {
            if (statusOf(error) === 401 || statusOf(error) === 403) {
              await commit(start, async () => {
                await store.clearTokens()
                await setState({ status: 'signed-out' })
              })
            } else {
              const cached = await store.readState()
              const session = await store.readSession?.()
              await commit(start, async () => {
                await setState(
                  cached?.user && (!store.readSession || session?.userId === cached.user.id)
                    ? { status: 'signed-in', user: cached.user }
                    : { status: 'error', error: 'network' },
                )
              })
            }
          }
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
    await hydrate()
    const start = ++revision
    try {
      const { devCode } = await api.auth.requestMagicLink(email)
      await commit(start, async () => {
        await setState({
          status: 'code-sent',
          pendingEmail: email,
          codeExpiresAt: Date.now() + 10 * 60 * 1000,
          attemptsLeft: 5,
        })
      })
      if (revision !== start) return { ok: false, error: 'unauthorized' }
      return { ok: true, devCode, state }
    } catch (error) {
      const kind = endpointErrorKind(error)
      await commit(start, async () => {
        await setState({ status: 'error', error: kind })
      })
      return { ok: false, error: kind }
    }
  }

  async function verify(email: string, code: string): Promise<VerifyResponse> {
    const start = ++revision
    const pending = pendingAuthStateSchema.safeParse(await store.readState())
    try {
      const tokens = await api.auth.verify(email, code)
      if (revision !== start) return { ok: false, error: 'unauthorized' }
      await commit(start, async () => {
        await store.setTokens(tokens)
        hydrated = true
        await setState({ status: 'signed-in', user: tokens.user })
      })
      if (revision !== start) return { ok: false, error: 'unauthorized' }
      return { ok: true, state }
    } catch (error) {
      const kind = endpointErrorKind(error)
      if (revision === start)
        await commit(start, async () => {
          if (pending.success && pending.data.pendingEmail === email) {
            await setState({
              ...pending.data,
              attemptsLeft: Math.max(
                0,
                (pending.data.attemptsLeft ?? 5) - (kind === 'invalid-code' ? 1 : 0),
              ),
            })
          } else {
            await setState({ status: 'error', error: kind })
          }
        })
      return { ok: false, error: kind, state }
    }
  }

  /**
   * Adopt a session handed off from the web app by redeeming a one-time code for
   * this surface's OWN session (mirrors `verify`). Best-effort: a failed/expired/
   * raced code is reported but must NOT flip a signed-out surface into an error
   * state — the next app visit re-bootstraps it.
   */
  async function adoptHandoff(code: string): Promise<VerifyResponse> {
    const start = ++revision
    try {
      const tokens = await api.auth.redeemHandoff(code)
      if (revision !== start) return { ok: false, error: 'unauthorized' }
      await commit(start, async () => {
        await store.setTokens(tokens)
        hydrated = true
        await setState({ status: 'signed-in', user: tokens.user })
      })
      if (revision !== start) return { ok: false, error: 'unauthorized' }
      return { ok: true, state }
    } catch (error) {
      return { ok: false, error: endpointErrorKind(error) }
    }
  }

  async function logout(): Promise<{ ok: true }> {
    const start = ++revision
    const refresh = await store.getRefresh()
    await commit(start, async () => {
      await store.clearTokens()
      hydrated = true
      await setState({ status: 'signed-out' })
    })
    // Local sign-out must not wait for an unreachable server.
    if (refresh) void api.auth.logout(refresh).catch(() => {})
    return { ok: true }
  }

  async function performRefresh(): Promise<string | undefined> {
    const start = revision
    const refresh = await store.getRefresh()
    if (!refresh || revision !== start) return undefined
    try {
      const tokens = await api.auth.refresh(refresh)
      if (revision !== start) return undefined
      await commit(start, () => store.setTokens(tokens))
      return revision === start ? tokens.accessToken : undefined
    } catch (error) {
      if (revision !== start) return undefined
      if ([401, 403].includes(statusOf(error) ?? 0)) {
        await onAuthError()
        return undefined
      }
      throw error // A transient outage must not sign out a valid cached account.
    }
  }

  function refreshAuth(): Promise<string | undefined> {
    refreshing ??= performRefresh().finally(() => {
      refreshing = null
    })
    return refreshing
  }
  async function onAuthError(): Promise<void> {
    const start = ++revision
    await commit(start, async () => {
      await store.clearTokens()
      hydrated = true
      await setState({ status: 'error', error: 'unauthorized' })
    })
  }

  return {
    handlers: { getState, requestCode, verify, logout, adoptHandoff },
    refreshAuth,
    onAuthError,
  }
}
