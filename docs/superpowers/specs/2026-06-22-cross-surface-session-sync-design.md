# Cross-Surface Session Sync (Web App → Extension) — Design Spec

**Date:** 2026-06-22
**Status:** Proposed
**Scope:** Let a user who is signed in on **app.quikfill.io** have the Chrome extension adopt a session **automatically, with zero clicks and no second OTP email**. Spans three surfaces: a small backend addition (`quikfill-services`), shared contracts + the web app emitter (`apps/app`), and the extension bridge (`apps/chrome-extension`).

> Supersedes the "No dashboard SSO bridge" deferral in [`2026-05-29-extension-auth-design.md`](./2026-05-29-extension-auth-design.md) (locked decision #4 / out-of-scope). All of that spec's plumbing — background-owned tokens, `chrome.runtime` messaging, the non-sensitive `auth:state` snapshot, `@quikfill/api-client`, `@quikfill/schemas` — is reused, not rebuilt.

## Problem

Today the extension runs its own magic-link/OTP sign-in even when the user is already signed in on the web app. Install funnel: user signs into app.quikfill.io → downloads the extension from Settings → Setup → installs → must re-do the whole email-OTP flow in the popup. Annoying and avoidable.

## Locked decisions

1. **Zero-click, one-time handoff — mint, don't copy.** The web app does **not** hand its tokens to the extension. It exchanges its session for a **single-use, ~60s handoff code**; the extension redeems that code for its **own brand-new session**. Tokens never cross the boundary — only the code does.
2. **Independent sessions.** Each surface holds its own session and rotates its own refresh token. This is _required_: refresh tokens are single-use with rotation ([`auth.service.ts`](../../../services/src/modules/auth/application/auth.service.ts)), so two surfaces sharing one refresh token would fight and one would get logged out within ~15 min. Consequence: **sign-out is per-surface** (signing out of the web app does not sign out the extension). Cross-surface sign-out is explicitly out of scope.
3. **Web-app emitter transport (not `externally_connectable`, not localStorage-read).** The web app — which legitimately owns the tokens — mints the code with its _own_ authenticated api-client and `window.postMessage`s only the code to the extension's content script. The extension never reads the web app's tokens. This survives the planned migration of the refresh token to an httpOnly cookie (Iteration 10 backend hardening), which the localStorage-read alternative would not.
4. **No manifest change, no new permissions.** The bridge rides the **already-declared `<all_urls>` content script** + same-page `window.postMessage`. The redeem call goes to `api.quikfill.io` (already in `host_permissions`). Nothing requires re-review of the pending CWS listing.

## End-to-end flow

```
app.quikfill.io (signed in)          extension content script        extension background        backend
        │                                     │ (loads, asks: signed in?) │                          │
        │                                     │──── AUTH_GET_STATE ───────▶│                          │
        │                                     │◀──── signed-out ───────────│                          │
        │◀──── postMessage QF_EXT_HELLO ──────│                            │                          │
        │── api.auth.createHandoff() ─────────┼────────────────────────────┼───── POST /auth/handoff ▶│ (authed: mint code)
        │◀──── { code, expiresIn } ───────────┼────────────────────────────┼──────────────────────────│
        │──── postMessage QF_EXT_HANDOFF ────▶│                            │                          │
        │                                     │── AUTH_ADOPT_HANDOFF{code}▶│── POST /auth/handoff/redeem ▶│ (public: mint NEW session)
        │                                     │                            │◀──── AuthTokensDto ───────│
        │                                     │                            │ persist tokens, snapshot signed-in
        │                                     │                            │ → all surfaces flip via storage.onChanged
```

If the extension session is ever lost while the app stays signed in, the same handshake re-bootstraps on the next app visit — it self-heals. Steady state (already signed in) is silent: the content script checks state first and does nothing.

## Components

### A. Backend — handoff endpoints (`quikfill-services`)

New, inside the existing auth module; reuses `TokenService` generation/hashing + `SessionRepository`.

- **Persistence:** a single-use handoff code — high-entropy opaque value, **hashed at rest** (SHA-256, like refresh tokens), `~60s` TTL, bound to `userId`, marked consumed on redeem. Modeled on the existing refresh-token hashing + magic-link OTP lifecycle (single-use, short expiry). Exact table/store aligned to the existing OTP persistence during implementation.
- `POST /auth/handoff` — **authenticated** (existing `JwtAuthGuard`), throttled 5/60s. `AuthService.createHandoffCode(userId)` → generate, hash+store, return plaintext **once**. Response `HandoffCodeDto { code: string; expiresIn: number }`.
- `POST /auth/handoff/redeem` — **public**, throttled 5/60s (mirrors `/auth/verify`, which is also a public code-exchange). Body `{ code }`. `AuthService.redeemHandoff(code, userAgent)` → hash, look up **unconsumed + unexpired** by hash, mark consumed (single-use), then mint a session via the **same path `verify` uses** (issue access JWT + refresh token, create a new `Session` row, tag `userAgent`). Returns the standard `AuthTokensDto`. Invalid/expired/consumed → 400/401 with the existing typed-error style.
- **CORS:** unchanged. Mint is called from app.quikfill.io (already allowed). Redeem is called from the extension background, which bypasses CORS via `host_permissions`.

### B. Shared contracts — `@quikfill/schemas`

Single source of truth for both the handoff DTOs and the bridge message protocol (so the web app and the content script can't drift).

- `handoffCodeSchema` → `{ code: string; expiresIn: number }` (mint response).
- `redeemHandoffInputSchema` → `{ code: string }`. Redeem **response reuses `authTokensSchema`**.
- Bridge protocol (`handoff-bridge.ts`): the constants `QF_EXT_HELLO` / `QF_EXT_HANDOFF` and a Zod schema per message (`{ type: 'QF_EXT_HELLO' }`, `{ type: 'QF_EXT_HANDOFF'; code: string }`) used to validate every inbound `postMessage`.
- Per the repo's null convention, any optional response field uses `nullableOptional()` — none here, both fields are always present.

### C. api-client — `@quikfill/api-client`

Two methods on the existing `auth` client, following the existing public/authed call patterns:

- `auth.createHandoff()` → `POST /auth/handoff` (carries the client's bearer; used by the **web app**), parse `handoffCodeSchema`.
- `auth.redeemHandoff(code)` → `POST /auth/handoff/redeem` (**no auth**; used by the **extension background**), parse `authTokensSchema`. Must be callable with no token and must **not** engage the 401-refresh wrapper — mirror how `verify`/`requestMagicLink` are issued as public calls.

### D. Web app emitter — `apps/app`

A small **boot module** registered once at app startup (Vue plugin in `main.ts`, or `App.vue` `onMounted`) — not a component, not a store (it _calls_ the auth store + api-client; per CLAUDE.md, stores don't call composables). Responsibilities:

1. `window.addEventListener('message', …)` — accept only `event.source === window && event.origin === window.location.origin`, then Zod-parse against the bridge schema. Ignore everything else.
2. On `QF_EXT_HELLO`: if the auth store is **signed in**, `await api.auth.createHandoff()` and `window.postMessage({ type: 'QF_EXT_HANDOFF', code }, location.origin)`. If signed out, set an in-memory `extPresent` flag and do nothing yet.
3. Watch the auth store's signed-in transition: when the user becomes signed in **and** `extPresent`, mint + post the code. (Covers extension-installed-before-login.)

Minting uses the web app's normal authenticated api-client → decoupled from where tokens are stored (future-proof for httpOnly cookies).

### E. Extension content-script bridge — `apps/chrome-extension`

Added to the existing `<all_urls>` content script, **origin-gated** to the app and never any other site. The app origin is a new build-time constant injected like the existing `WXT_QF_API_BASE_URL` (e.g. `WXT_QF_APP_ORIGIN`, default `https://app.quikfill.io` in prod, the dev app URL — `http://localhost:3000` — in dev). The bridge runs only when `location.origin` matches it:

1. On load (only on the app origin): `requestAuthState()` (existing `AUTH_GET_STATE`). If signed-in → **do nothing**.
2. If signed-out → `window.postMessage({ type: 'QF_EXT_HELLO' }, location.origin)` and listen for `QF_EXT_HANDOFF` (validate `event.source === window && event.origin === location.origin`, Zod-parse).
3. On a valid handoff code → forward to background via the new `adoptHandoff(code)` helper.

The content script only ever carries the **code**, never tokens — consistent with the locked decision that tokens never reach content scripts.

### F. Extension messaging + background — `@quikfill/browser-adapter` + `entrypoints/background.ts`

- `auth-messaging.ts`: new kind `AUTH_ADOPT_HANDOFF { code }` → `{ ok: true; state: AuthState } | { ok: false; error: AuthErrorKind }`, surface helper `adoptHandoff(code)`, wired into `onAuthRequest(handlers)`.
- Background handler `adoptHandoff(code)` → `api.auth.redeemHandoff(code)` → persist via the **same path as `verify`** (`tokens.set(...)`, set user, write the signed-in `auth:state` snapshot). On failure → stay signed-out and swallow (this is best-effort background bootstrap; log only). Surfaces react via the existing `chrome.storage.onChanged` listener.

### G. Install bootstrap — `entrypoints/background.ts`

On `chrome.runtime.onInstalled`, open app.quikfill.io in a tab (`chrome.tabs.create` — no `tabs` permission needed to _create_). The freshly-loaded page runs the content script, which performs the handshake. This covers the cold-install case and the "app tab was already open but predates the content script" case without a reload prompt. Simpler fallback if undesired: skip the tab-open and let the handshake fire on the user's next app navigation/visit.

## Out of scope (YAGNI)

- Cross-surface sign-out (web app sign-out → extension sign-out, or vice-versa). Independent sessions by design.
- Extension → web app direction (extension login bootstrapping the web app).
- `externally_connectable` / hardcoded extension ID / `chrome.identity.launchWebAuthFlow`.
- Any manifest/permission change; any new sign-in UI (zero-click reuses the existing `loading`/`signed-in` states).
- Backend httpOnly-cookie migration itself (this design is merely compatible with it).

## Testing (vitest colocated + e2e per repo style)

- **Backend:** unit — `createHandoffCode`/`redeemHandoff`: single-use enforced (second redeem fails), expiry enforced, wrong/unknown code rejected, minted session is **independent** (refresh token differs from any existing session). e2e — both endpoints, throttle, `/auth/handoff` 401 without auth.
- **Schemas:** `handoffCodeSchema` / bridge message schemas parse + reject malformed.
- **api-client:** `createHandoff` sends bearer; `redeemHandoff` issues a public call (no token, no refresh wrapper) and parses `authTokensSchema`.
- **Web app:** emitter — ignores wrong-origin / wrong-source / malformed messages; mints + posts on `QF_EXT_HELLO` when signed in; defers then posts on sign-in when `extPresent`.
- **Extension:** content-script bridge — only acts on the app origin, only on signed-out, validates inbound message; background `adoptHandoff` — happy path persists like verify, failure stays signed-out.
- **Manual/integration:** real-browser loop — sign into app, install, confirm popup is signed-in with no OTP.

## Risks / notes

- **Security boundary is the code:** single-use, ~60s, hashed, server-validated. A forged `postMessage` is useless (a real code must be backend-minted), and any script already running on app.quikfill.io has localStorage = full account access — so the bridge adds **no new exposure** beyond today's posture. The app's CSP further constrains script execution.
- **Best-effort, silent:** redeem failures (expired/raced code) are swallowed; the next app visit re-bootstraps. No user-facing error state needed.
- **Two repos:** Component A lands in `quikfill-services`; B–G in `quikfill-frontend`. The implementation plan will split per-repo accordingly.
