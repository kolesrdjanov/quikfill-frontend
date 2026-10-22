import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AccountExport,
  ExtensionSettings,
  UpdateProfileInput,
  UserAccount,
} from '@quikfill/schemas'
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
  let revision = 0

  const isAuthenticated = computed(() => user.value !== null)

  /** Request a sign-in code; returns the dev code when the backend exposes one. */
  async function requestCode(email: string): Promise<string | undefined> {
    const result = await api.auth.requestMagicLink(email)
    return result.devCode
  }

  /** Exchange an email + OTP code for a session. */
  async function verify(email: string, code: string): Promise<void> {
    const start = ++revision
    const tokens = await api.auth.verify(email, code)
    if (revision !== start) return
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
    const start = revision
    if (authTokens.hasSession) {
      try {
        const incoming = await api.users.me()
        if (revision !== start) return
        user.value = incoming
        authTokens.setOwner(incoming.id)
      } catch {
        if (revision !== start) return
        authTokens.clear()
        user.value = null
      }
    }
    restored.value = true
  }

  async function logout(): Promise<void> {
    ++revision
    const refreshToken = authTokens.getRefresh()
    authTokens.clear()
    user.value = null
    if (refreshToken) void api.auth.logout(refreshToken).catch(() => {})
  }

  /** Update the signed-in user's profile; mirrors the result so the UI updates live. */
  async function updateProfile(input: UpdateProfileInput): Promise<void> {
    const start = revision
    const incoming = await api.users.updateMe(input)
    if (revision === start) user.value = incoming
  }

  /** Replace the user's extension settings; mirrors the result so the UI updates live. */
  async function updateSettings(input: ExtensionSettings): Promise<void> {
    const start = revision
    const incoming = await api.users.updateSettings(input)
    if (revision === start) user.value = incoming
  }

  /** Download a full export of everything QuikFill holds for the signed-in user. */
  function exportData(): Promise<AccountExport> {
    return api.users.exportData()
  }

  /** Permanently delete the account, then drop the local session. */
  async function deleteAccount(): Promise<void> {
    const start = revision
    await api.users.deleteAccount()
    if (revision !== start) return
    ++revision
    authTokens.clear()
    user.value = null
  }

  /** Called by the API client when a refresh fails — drop the local session. */
  function forceSignOut(): void {
    ++revision
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
    exportData,
    deleteAccount,
    forceSignOut,
  }
})
