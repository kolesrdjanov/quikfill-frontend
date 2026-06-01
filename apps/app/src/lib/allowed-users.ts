/**
 * Soft, client-side allowlist for who may start the sign-in flow.
 *
 * Driven by the `ALLOWED_USERS` env var (semicolon-separated emails — exposed to
 * the bundle via `envPrefix` in `vite.config.ts`). This is a UX gate ONLY: the
 * list ships in the JS bundle and the backend still serves any valid session, so
 * real access control MUST live in `quikfill-services`. We use it to keep the
 * billing-only deployment limited to a known set of testers.
 *
 * When the var is unset/empty, the gate is OPEN (allow everyone) so local dev and
 * un-configured environments aren't bricked.
 */
const allowedUsers: ReadonlySet<string> = new Set(
  (import.meta.env.ALLOWED_USERS ?? '')
    .split(/[;,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
)

/** Whether any allowlist is configured. Empty → the gate is open. */
export const allowlistEnabled = allowedUsers.size > 0

/** True when `email` may sign in (always true when no allowlist is configured). */
export function isEmailAllowed(email: string): boolean {
  if (!allowlistEnabled) return true
  return allowedUsers.has(email.trim().toLowerCase())
}
