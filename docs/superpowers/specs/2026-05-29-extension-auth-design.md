# Chrome Extension Auth — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation
**Scope:** Wire up authentication plumbing for the MV3 Chrome extension. **Excludes** all templates / sign-in UI / state screens — those are owned by Claude Design and will bind to the composable contract defined here.

## Goal

The extension currently ships with no auth: `entrypoints/background.ts` builds an `AiClient` with only a base URL ("Iteration 10 replaces this with configured + authenticated transport"). Users must be signed in to use the app. This spec adds everything non-visual needed for a working sign-in/session lifecycle, leaving a clean reactive contract for the UI.

## Locked decisions

1. **Background-owned session.** The background service worker owns tokens, the api/ai client, and the single refresh-coordination point. Surfaces drive auth via `chrome.runtime` messaging + `chrome.storage.onChanged`, mirroring the existing `AI_CLASSIFY` pattern. Tokens never reach content scripts.
2. **Whole-extension gate.** Sign-in is required before any surface is usable. Expressed through `useAuth().isAuthenticated`; surfaces render the (Design-owned) sign-in screen when not signed in.
3. **Typed error states, no billing.** Backend status/codes map to a typed `AuthErrorKind`. No subscription/entitlement model is built — `payment-required`/`quota-exceeded` states are mapped now so Design has stable targets.
4. **Independent extension session.** The extension keeps its own session in `chrome.storage.local` via its own magic-link/OTP sign-in. No dashboard SSO bridge.

## What already exists (reused, not rebuilt)

- `@quikfill/api-client` — `createApiClient` (full REST incl. `auth.requestMagicLink/verify/refresh/logout`, `users.me`) and `createAiClient`. Both accept `getAuthToken`; the REST client also accepts `refreshAuth`/`onAuthError` with 401-refresh + coalesced concurrent refresh.
- `@quikfill/schemas` — `authTokensSchema`, `magicLinkRequestedSchema`, `userAccountSchema`, `verifyMagicLinkInputSchema`, etc.
- `@quikfill/browser-adapter` — `createChromeStorageAdapter`, the `ai-messaging` request/response pattern.
- Dashboard reference: `apps/app/src/lib/auth-tokens.ts`, `apps/app/src/lib/api.ts`, `apps/app/src/stores/auth.ts` (localStorage-based; the extension uses an async chrome.storage analogue).
- Backend emits `UNAUTHORIZED` (401), `INVALID_TOKEN` (401), `VALIDATION_ERROR` (400), `QUOTA_EXCEEDED` (429), `SERVICE_UNAVAILABLE` (503).

## Components

### A. Shared types + pure error mapping — `@quikfill/schemas` (`auth.ts`)

```ts
export type AuthErrorKind =
  | 'invalid-code' // 400 — bad/expired OTP
  | 'unauthorized' // 401 — session invalid
  | 'quota-exceeded' // 429 — usage limit (subscription-related)
  | 'payment-required' // 402 — billing required (subscription-related; not yet emitted)
  | 'unavailable' // 503 — backend down
  | 'network' // transport failure (no/!status)
  | 'unknown' // anything else

export type AuthStatus = 'loading' | 'signed-out' | 'code-sent' | 'signed-in' | 'error'

export interface AuthState {
  status: AuthStatus
  user?: UserAccount // present when signed-in
  pendingEmail?: string // present when code-sent
  error?: AuthErrorKind // present when status === 'error'
}
```

`authErrorKind(status?: number): AuthErrorKind` — pure status→kind mapping (no `status` ⇒ `network`). Lives here (no chrome dependency) so background, messaging, and tests share one source of truth. Exported from the schemas index.

**Context note (401):** the backend returns a uniform `INVALID_TOKEN` (HTTP 401) for every `/auth/verify` failure (wrong / expired / unknown — deliberate, to prevent account enumeration). On the _public_ auth endpoints (`magic-link`, `verify`) a 401 therefore means "bad code", so the background manager remaps it to `invalid-code` (`endpointErrorKind`). A genuine `unauthorized` only arises from an authenticated request / a failed token refresh, which `onAuthError` surfaces as the "session expired" state.

### B. Messaging protocol — `@quikfill/browser-adapter` (`auth-messaging.ts`)

Surface → background request/response, modeled on `ai-messaging.ts` (never throws; missing receiver resolves to a typed failure). Message kinds:

- `AUTH_GET_STATE` → `AuthState`
- `AUTH_REQUEST_CODE { email }` → `{ ok: true; devCode?: string } | { ok: false; error: AuthErrorKind }`
- `AUTH_VERIFY { email, code }` → `{ ok: true; state: AuthState } | { ok: false; error: AuthErrorKind }`
- `AUTH_LOGOUT` → `{ ok: true }`

Exports: constants, `isAuth*Request` type guards, surface helpers `requestAuthState()`, `requestAuthCode(email)`, `verifyAuthCode(email, code)`, `logoutAuth()`, and a single background registrar `onAuthRequest(handlers)` that wires `chrome.runtime.onMessage` (returns `true` to keep the channel open for async `sendResponse`). Exported from the browser-adapter index.

### C. Extension token store — `apps/chrome-extension/lib/auth-tokens.ts`

Async analogue of the dashboard's `authTokens`, backed by `chrome.storage.local` (localStorage is unavailable in MV3 service workers). Keys: `qf_access_token`, `qf_refresh_token`. Methods: `getAccess()`, `getRefresh()`, `set(tokens)`, `clear()`, `hasSession()` — all `Promise`-returning. Read/written only by the background manager.

### D. Background auth manager — `apps/chrome-extension/entrypoints/background.ts` (+ `lib/background-auth.ts`)

- Builds the full `createApiClient({ baseUrl, getAuthToken, refreshAuth, onAuthError })` reading the token store. `getAuthToken` → `tokens.getAccess()`; `refreshAuth` → `auth.refresh(storedRefresh)` then persist (or clear + return undefined); `onAuthError` → forced sign-out.
- Builds `createAiClient({ baseUrl, getAuthToken })` from the **same** token store, so AI classify now carries `Bearer`.
- Registers `onAuthRequest`:
  - **request-code** → `api.auth.requestMagicLink(email)`; on success store `pendingEmail`, return `devCode`.
  - **verify** → `api.auth.verify(email, code)`; persist tokens, set user, snapshot signed-in.
  - **logout** → best-effort `api.auth.logout(refresh)`, then clear + snapshot signed-out.
  - **get-state** → return the current snapshot (hydrated on first call via `users.me()` if a token exists).
- **Snapshot:** writes a non-sensitive `auth:state` (`{ status, user }`, no tokens) to `chrome.storage.local` on every transition. Forced sign-out (failed refresh) also rewrites it so all surfaces react.
- Errors from the api-client (`ApiClientError`) are mapped via `authErrorKind(err.status)` before crossing the message boundary.

### E. Surface composable — `apps/chrome-extension/lib/useAuth.ts`

The contract the UI binds to (Vue 3 `<script setup>`). Returns:

- `state: Readonly<Ref<AuthState>>`, plus `isAuthenticated` / `isLoading` computeds and `pendingEmail`/`error` conveniences.
- `init()` — calls `requestAuthState()` and subscribes to `chrome.storage.onChanged` on `auth:state` so sign-in/out (and forced sign-out) in any surface propagates everywhere; idempotent.
- `requestCode(email)` / `verify(email, code)` / `logout()` — thin wrappers over the messaging helpers that update local reactive state from responses.

Module-level singleton (like `useSettings`) so all components in a surface share one reactive state.

## Out of scope (YAGNI)

- Sign-in screens / state screens / any template or styling (Claude Design).
- Billing/entitlement model, plan tiers, usage fetch, upgrade flow.
- Dashboard SSO / cross-context token handoff.
- Manifest changes — `localhost:4010` is already in `host_permissions`; a code comment notes the prod origin must be added at build time (same as today's AI base URL).

## Testing (vitest, colocated, matching repo style)

- `auth-messaging.test.ts` — request/response round-trips; missing receiver ⇒ typed failure.
- `auth-tokens` store — get/set/clear/hasSession over a fake `chrome.storage.local` area.
- `authErrorKind` — full status→kind table incl. `undefined ⇒ network`.
- background auth handlers — request-code/verify/logout/get-state happy paths + forced sign-out rewrites snapshot. (Driven through `onAuthRequest` with a stubbed api client + fake storage.)

## Risks / notes

- Content scripts technically can read `chrome.storage.local`; the security posture (unchanged from today) is that the api-client/base-URL only ever runs in the background and content scripts never read tokens. The `auth:state` snapshot is non-sensitive by construction (no tokens).
- 402 `payment-required` is not emitted by the backend yet; mapping it is forward-looking and harmless.
