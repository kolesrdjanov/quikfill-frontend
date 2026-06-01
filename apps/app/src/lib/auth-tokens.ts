import type { AuthTokens } from '@quikfill/schemas'

/**
 * The single source of truth for the access + refresh tokens. Kept as a plain
 * module (not a store) so `@quikfill/api-client` can read/refresh them without a
 * circular dependency on the Pinia store. Persisted to `localStorage` so a
 * reload keeps the session.
 *
 * SECURITY: `localStorage` is readable by any script on the origin, so a
 * successful XSS could exfiltrate BOTH tokens (the long-lived refresh token is
 * the bigger prize). A strict Content-Security-Policy ships with the app
 * (`public/_headers`) to shrink that attack surface. The stronger fix — an
 * `HttpOnly; Secure; SameSite` refresh cookie issued by `quikfill-services`,
 * with only a short-lived access token held here (ideally in memory) — is gated
 * on a backend change and tracked for the Iteration 10 backend hardening.
 */
const ACCESS_KEY = 'qf_access_token'
const REFRESH_KEY = 'qf_refresh_token'

export const authTokens = {
  getAccess(): string | undefined {
    return localStorage.getItem(ACCESS_KEY) ?? undefined
  },
  getRefresh(): string | undefined {
    return localStorage.getItem(REFRESH_KEY) ?? undefined
  },
  set(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
  get hasSession(): boolean {
    return this.getAccess() !== undefined
  },
}
