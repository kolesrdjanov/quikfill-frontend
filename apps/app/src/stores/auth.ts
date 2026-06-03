import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ExtensionSettings, UpdateProfileInput, UserAccount } from '@quikfill/schemas'
import { api } from '@/lib/api'
import { authTokens } from '@/lib/auth-tokens'

/**
 * Owns the authenticated user + session lifecycle. Tokens themselves live in the
 * `authTokens` module (so the API client can refresh without importing the
 * store); this store mirrors the resulting user and a `restored` flag the router
 * guard waits on before deciding access.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserAccount | null>(null)
  const restored = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /** Request a sign-in code; returns the dev code when the backend exposes one. */
  async function requestCode(email: string): Promise<string | undefined> {
    const result = await api.auth.requestMagicLink(email)
    return result.devCode
  }

  /** Exchange an email + OTP code for a session. */
  async function verify(email: string, code: string): Promise<void> {
    const tokens = await api.auth.verify(email, code)
    authTokens.set(tokens)
    user.value = tokens.user
    restored.value = true
  }

  /**
   * Hydrate the session on first load: if a token exists, fetch the user (which
   * transparently refreshes an expired access token). Idempotent.
   */
  async function restore(): Promise<void> {
    if (restored.value) return
    if (authTokens.hasSession) {
      try {
        user.value = await api.users.me()
      } catch {
        authTokens.clear()
        user.value = null
      }
    }
    restored.value = true
  }

  async function logout(): Promise<void> {
    const refreshToken = authTokens.getRefresh()
    if (refreshToken) {
      try {
        await api.auth.logout(refreshToken)
      } catch {
        // Best-effort: revoke locally even if the server call fails.
      }
    }
    authTokens.clear()
    user.value = null
  }

  /** Update the signed-in user's profile; mirrors the result so the UI updates live. */
  async function updateProfile(input: UpdateProfileInput): Promise<void> {
    user.value = await api.users.updateMe(input)
  }

  /** Replace the user's extension settings; mirrors the result so the UI updates live. */
  async function updateSettings(input: ExtensionSettings): Promise<void> {
    user.value = await api.users.updateSettings(input)
  }

  /** Called by the API client when a refresh fails — drop the local session. */
  function forceSignOut(): void {
    authTokens.clear()
    user.value = null
  }

  return {
    user,
    restored,
    isAuthenticated,
    requestCode,
    verify,
    restore,
    logout,
    updateProfile,
    updateSettings,
    forceSignOut,
  }
})
