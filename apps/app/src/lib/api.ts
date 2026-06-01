import { createApiClient } from '@quikfill/api-client'
import { authTokens } from './auth-tokens'

let authErrorHandler: () => void = () => {}

/** Register a callback invoked when the session is unrecoverable (forces sign-out). */
export function onAuthError(handler: () => void): void {
  authErrorHandler = handler
}

/**
 * The app-wide API client. Reads the access token from {@link authTokens}, and
 * on a 401 transparently rotates the refresh token once (concurrent 401s share
 * the single in-flight refresh) before retrying the original request.
 */
export const api = createApiClient({
  // Dev: relative `/api/v1`, proxied to localhost:4010 by Vite (sidesteps CORS).
  // Prod (Cloudflare Pages at app.quikfill.io): the API is a SEPARATE origin, so
  // set `VITE_QF_API_BASE_URL=https://api.quikfill.io/api/v1` at build time. That
  // origin must also be in the CSP `connect-src` (public/_headers) and the
  // backend CORS allowlist. Mirrors the chrome-extension's `QF_API_BASE_URL`.
  baseUrl: import.meta.env.VITE_QF_API_BASE_URL ?? '/api/v1',
  getAuthToken: () => authTokens.getAccess(),
  refreshAuth: async () => {
    const refreshToken = authTokens.getRefresh()
    if (!refreshToken) return undefined
    try {
      const tokens = await api.auth.refresh(refreshToken)
      authTokens.set(tokens)
      return tokens.accessToken
    } catch {
      authTokens.clear()
      return undefined
    }
  },
  onAuthError: () => authErrorHandler(),
})
