import { computed, readonly, ref } from 'vue'
import type { AuthState } from '@quikfill/schemas'
import {
  AUTH_STATE_KEY,
  logoutAuth,
  requestAuthCode,
  requestAuthState,
  verifyAuthCode,
  type RequestCodeResponse,
  type VerifyResponse,
} from '@quikfill/browser-adapter'

/**
 * The surface-facing auth contract. All session logic lives in the background
 * worker (see `createBackgroundAuth`); this composable is the thin reactive
 * shell the sidepanel/popup/options bind to. It drives auth through the
 * (unit-tested) messaging helpers and stays in sync via `storage.onChanged`,
 * so a sign-in/out — or a forced sign-out from a failed refresh — in any surface
 * propagates to all of them.
 *
 * UI (Claude Design) binds to `state` / `isAuthenticated` and calls
 * `requestCode` → `verify`. This module owns no templates.
 *
 * Module-level singleton (like `useSettings`) so every component in a surface
 * shares one reactive state.
 */
const state = ref<AuthState>({ status: 'loading' })
let initialized = false

function apply(next: AuthState): void {
  state.value = next
}

export function useAuth() {
  /**
   * Hydrate from the background and subscribe to cross-surface changes.
   * Idempotent — safe to call from every surface's `onMounted`.
   */
  async function init(): Promise<AuthState> {
    if (initialized) return state.value
    initialized = true
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const change = changes[AUTH_STATE_KEY]
      if (change && change.newValue) apply(change.newValue as AuthState)
    })
    apply(await requestAuthState())
    return state.value
  }

  /** Request an emailed sign-in code. The returned `devCode` (dev only) is for testing. */
  async function requestCode(email: string): Promise<RequestCodeResponse> {
    const result = await requestAuthCode(email)
    apply(
      result.ok
        ? { status: 'code-sent', pendingEmail: email }
        : { status: 'error', error: result.error },
    )
    return result
  }

  /** Exchange the email + OTP for a session. */
  async function verify(email: string, code: string): Promise<VerifyResponse> {
    const result = await verifyAuthCode(email, code)
    apply(result.ok ? result.state : { status: 'error', error: result.error })
    return result
  }

  /** End the session. */
  async function logout(): Promise<void> {
    await logoutAuth()
    apply({ status: 'signed-out' })
  }

  return {
    state: readonly(state),
    isAuthenticated: computed(() => state.value.status === 'signed-in'),
    isLoading: computed(() => state.value.status === 'loading'),
    user: computed(() => state.value.user),
    pendingEmail: computed(() => state.value.pendingEmail),
    error: computed(() => state.value.error),
    init,
    requestCode,
    verify,
    logout,
  }
}
