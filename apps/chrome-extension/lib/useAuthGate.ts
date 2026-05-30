import { computed, readonly, ref, watch } from 'vue'
import type { AuthErrorKind, AuthState } from '@quikfill/schemas'
import { useAuth } from './useAuth'

/**
 * The screen the side panel renders before (and around) the fill flow. The
 * `app` screen means the auth gate is lifted — the real fill session is shown.
 */
export type AuthGateScreen =
  | 'loading'
  | 'email'
  | 'sending'
  | 'otp'
  | 'verifying'
  | 'success'
  | 'app'
  | 'error'
  | 'subscription'
  | 'offline'
  | 'session'
  | 'ratelimit'
  | 'update'

/** OTP sub-state. Tracked **client-side** — the backend returns a uniform error. */
export type OtpError = null | 'wrong' | 'expired' | 'locked'

// Mirror the backend's auth rules (AUTH_STATES.md). The server never tells us
// *why* a code failed (uniform INVALID_TOKEN to prevent enumeration), so the
// attempt counter and TTL are tracked here to choose wrong / expired / locked.
const OTP_MAX_ATTEMPTS = 5
const OTP_TTL_MS = 10 * 60 * 1000
// No Retry-After is surfaced by the adapter yet; a fixed cooldown keeps the
// rate-limit screen honest until the backend envelope is plumbed through.
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000
// Client-side version floor. Inert until a real minimum ships (the backend does
// not advertise one today); wiring the screen now keeps the state reachable.
const MIN_SUPPORTED_VERSION = '0.0.0'

// Module-level singletons (like `useAuth` / `useSettings`) so every component in
// a surface shares one gate, and the watchers/derivations below are created once.
const auth = useAuth()
const screen = ref<AuthGateScreen>('loading')
const otpError = ref<OtpError>(null)
const email = ref('')
const attemptsLeft = ref(OTP_MAX_ATTEMPTS)
const codeExpiresAt = ref(0)
const cooldownUntil = ref(0)
const now = ref(Date.now())
let initialized = false

/** Map a normalized auth failure to the blocking screen that recovers from it. */
function blockingScreenFor(kind: AuthErrorKind | undefined): AuthGateScreen {
  switch (kind) {
    case 'unauthorized':
      return 'session'
    case 'payment-required':
      return 'subscription'
    case 'quota-exceeded':
      return 'ratelimit'
    case 'unavailable':
    case 'network':
      return 'offline'
    default:
      return 'error'
  }
}

/** Resolve the screen from a freshly-read background snapshot (bootstrap). */
function screenFromAuth(state: AuthState): AuthGateScreen {
  switch (state.status) {
    case 'loading':
      return 'loading'
    case 'signed-in':
      return 'app'
    case 'code-sent':
      return 'otp'
    case 'error':
      // `invalid-code` from a bare snapshot has no pending OTP context to return
      // to, so treat it as a fresh sign-in rather than a stuck error.
      return state.error === 'invalid-code' ? 'email' : blockingScreenFor(state.error)
    case 'signed-out':
    default:
      return 'email'
  }
}

function currentVersion(): string {
  try {
    return browser.runtime.getManifest().version
  } catch {
    return '0.0.0'
  }
}

/** `a < b` for dotted numeric versions (e.g. "1.2.0"). */
function versionBelow(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db
  }
  return false
}

function secondsUntil(ts: number): number {
  return Math.max(0, Math.ceil((ts - now.value) / 1000))
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

// React to background-initiated transitions (e.g. a failed token refresh forces
// sign-out → session expired; a sign-out in another surface).
watch(
  () => auth.state.value,
  (next) => {
    if (next.status === 'error' && next.error === 'unauthorized') screen.value = 'session'
    else if (next.status === 'signed-out' && screen.value === 'app') screen.value = 'email'
    // Late hydration: the gate rendered the loader before the background resolved
    // the session (cold worker / slow `users.me()`). When the snapshot lands,
    // lift the loader instead of leaving the panel stuck on "Checking session".
    else if (next.status === 'signed-in' && screen.value === 'loading') screen.value = 'app'
  },
)

// TTL countdown: once the code expires, surface the expired sub-state.
watch(now, () => {
  if (
    screen.value === 'otp' &&
    otpError.value !== 'locked' &&
    codeExpiresAt.value &&
    now.value >= codeExpiresAt.value
  ) {
    otpError.value = 'expired'
  }
})

const otpExpired = computed(() => otpError.value === 'expired' || otpError.value === 'locked')
const cooldownSecondsLeft = computed(() => secondsUntil(cooldownUntil.value))

/** Hydrate from the background and start the countdown clock. Idempotent. */
async function init(): Promise<void> {
  if (initialized) return
  initialized = true

  if (versionBelow(currentVersion(), MIN_SUPPORTED_VERSION)) {
    screen.value = 'update'
    return
  }

  setInterval(() => {
    now.value = Date.now()
  }, 1000)

  const state = await auth.init()
  if (state.status === 'signed-in') email.value = state.user?.email ?? email.value
  if (state.status === 'code-sent') email.value = state.pendingEmail ?? email.value
  screen.value = screenFromAuth(state)
}

/** Begin (or restart) the sign-in flow on the email screen. */
function showSignIn(): void {
  otpError.value = null
  screen.value = 'email'
}

/** Request an emailed OTP, then move to the code screen. */
async function requestCode(value: string): Promise<void> {
  email.value = value
  otpError.value = null
  attemptsLeft.value = OTP_MAX_ATTEMPTS
  screen.value = 'sending'
  const result = await auth.requestCode(value)
  if (result.ok) {
    codeExpiresAt.value = Date.now() + OTP_TTL_MS
    screen.value = 'otp'
  } else {
    if (result.error === 'quota-exceeded') cooldownUntil.value = Date.now() + RATE_LIMIT_COOLDOWN_MS
    screen.value = blockingScreenFor(result.error)
  }
}

/** Verify the entered code; advance to success or surface the right failure. */
async function verify(code: string): Promise<void> {
  screen.value = 'verifying'
  const result = await auth.verify(email.value, code)
  if (result.ok) {
    otpError.value = null
    screen.value = 'success'
    return
  }
  if (result.error === 'invalid-code') {
    attemptsLeft.value = Math.max(0, attemptsLeft.value - 1)
    otpError.value = attemptsLeft.value <= 0 ? 'locked' : 'wrong'
    screen.value = 'otp'
  } else {
    screen.value = blockingScreenFor(result.error)
  }
}

/** Send a fresh code: reset the attempt counter + TTL and re-request. */
async function resend(): Promise<void> {
  await requestCode(email.value)
}

/** Lift the gate after the success screen → show the real fill flow. */
function enterApp(): void {
  screen.value = 'app'
}

/** Clear the one-shot "wrong code" styling as the user re-types. */
function clearWrongError(): void {
  if (otpError.value === 'wrong') otpError.value = null
}

/** End the session and return to sign-in. */
async function signOut(): Promise<void> {
  await auth.logout()
  otpError.value = null
  screen.value = 'email'
}

/**
 * The auth gate the side panel and popup bind to. Resolves which screen to show
 * before mounting the fill session (`useFillSession`) and owns the client-side
 * OTP attempt counter, TTL, and rate-limit cooldown.
 */
export function useAuthGate() {
  return {
    // state
    screen: readonly(screen),
    otpError: readonly(otpError),
    email: readonly(email),
    attemptsLeft: readonly(attemptsLeft),
    user: auth.user,
    isAppReady: computed(() => screen.value === 'app'),
    otpExpired,
    otpTimerLabel: computed(() => mmss(secondsUntil(codeExpiresAt.value))),
    cooldownSecondsLeft,
    cooldownLabel: computed(() => mmss(cooldownSecondsLeft.value)),
    cooldownActive: computed(() => cooldownSecondsLeft.value > 0),
    installedVersion: computed(() => currentVersion()),
    // actions
    init,
    showSignIn,
    requestCode,
    verify,
    resend,
    enterApp,
    clearWrongError,
    signOut,
  }
}
