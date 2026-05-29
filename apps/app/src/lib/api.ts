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
  baseUrl: '/api/v1',
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
