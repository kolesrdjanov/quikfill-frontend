# Handoff Supplement: QuikFill — Auth & Blocking States

> Companion to `README.md`. Covers the **passwordless email-OTP sign-in** that gates the
> whole extension, plus every state where the extension **can't be used** and how the user
> recovers. Reference prototype: **`prototype/Auth & States.html`** (fully clickable — type
> or paste a code on the "Enter code" screen; `123456` passes, anything else is rejected).

---

## Overview

QuikFill is **single-user and auth-gated**: only signed-in accounts can scan or fill. Before
any of the fill flow in `README.md` is reachable, the side panel must resolve one of:

1. **Signed in & entitled** → show the normal pre-scan state (the existing flow).
2. **Not signed in** → show the **sign-in flow** (email → OTP → verified).
3. **Can't be used** → show a **blocking state** (error / subscription / offline / session
   expired / rate-limited / update required).

This is the missing layer in front of the `prescan → … → results` machine.

---

## About the design files / fidelity

Same as `README.md`: the HTML is a **high-fidelity design reference**, not production code.
Recreate it in the existing extension app (`apps/chrome-extension` — WXT + Vue 3 + Tailwind v4
+ `@quikfill/ui`) as composed SFCs. The prototype's hand-rolled `state` object + string
templates exist only to make it clickable — **do not port that pattern.**

---

## How this maps to the real codebase

Auth is **iteration 10 / not yet built in the extension** (`apps/chrome-extension/CLAUDE.md`),
but the **backend and the dashboard's auth already exist** — port them, don't reinvent.

### Backend (already implemented — `quikfill-services`)

All auth routes are **public**, rate-limited to **5 requests/min per client**.

| Method | Route | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/auth/magic-link` | `{ email }` | `202 { message, devCode? }` — always neutral (never reveals if the email exists) |
| `POST` | `/auth/verify` | `{ email, code }` | `200 { accessToken, refreshToken, expiresIn: 900 }` |
| `POST` | `/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` (old refresh token revoked on use) |
| `POST` | `/auth/logout` | `{ refreshToken }` | `204` |

### Auth rules (these drive the UI copy and limits)

| Thing | Value | Env var |
| --- | --- | --- |
| OTP length | **6 digits** (numeric) | — |
| OTP TTL | **10 minutes** | `OTP_TTL_MINUTES` |
| OTP max attempts | **5**, then the code is burned/locked | `OTP_MAX_ATTEMPTS` |
| Access token TTL | 15 minutes (`expiresIn: 900`) | `ACCESS_TOKEN_TTL` |
| Refresh token TTL | 30 days | `REFRESH_TOKEN_TTL_DAYS` |
| Auth rate limit | 5 req/min per client | — |

> **Uniform failure (important):** every `/auth/verify` failure — unknown email, expired,
> wrong code, or locked — returns the **same `INVALID_TOKEN`** error. This is deliberate
> (prevents account enumeration). The UI must **not** distinguish "unknown email" from
> "wrong code". The prototype's "wrong / expired / locked" distinction is **client-side
> state only** (attempt counter + TTL countdown the extension tracks itself), not info leaked
> by the server.

### Dashboard auth to port (already implemented — `apps/app`)

- **`src/stores/auth.ts`** — the store to mirror in the extension:
  - `requestCode(email): Promise<string | undefined>` → calls `/auth/magic-link`, returns the
    dev code when the backend exposes one.
  - `verify(email, code): Promise<void>` → calls `/auth/verify`, stores the token pair.
  - `isAuthenticated`, `logout`, refresh-on-401 handling.
- **`src/views/SignIn.vue`** — the two-step (email → code) reference. **Note:** the dashboard
  uses a *single* spaced input; this extension design uses **6 segmented boxes** (better for
  paste in a narrow 384px panel). Validation schemas: `requestMagicLinkInputSchema`,
  `otpCodeInputSchema` (`@quikfill/schemas`).
- **`src/main.ts`** — on refresh-token failure, drop the session and route to sign-in. The
  extension equivalent is the **"Session expired"** state below.

### Error code → state map

| Backend signal | Extension state |
| --- | --- |
| no/expired access token, refresh fails | **Session expired** (re-auth) |
| `INVALID_TOKEN` on verify | OTP **rejected** (decrement local attempt counter) |
| local attempts ≥ 5 / TTL elapsed | OTP **locked** / **expired** (request new code) |
| `QUOTA_EXCEEDED` (429) on magic-link/verify | **Too many attempts** (cooldown) |
| `SERVICE_UNAVAILABLE` (503) / network error | **Can't connect** |
| subscription inactive / entitlement denied (Stripe — iteration 6) | **Check your subscription** |
| unhandled / 5xx | **Something went wrong** |
| extension build older than min supported | **Update required** (client-side version check) |

The extension needs a small **auth gate composable** (e.g. `useAuthGate`) that resolves the
current state before mounting the fill session (`useFillSession`). Bootstrap order on panel
open: read stored tokens → if none → sign-in; if present → try a lightweight authed call
(e.g. `/users/me` or entitlements) → route to `app` / `session` / `subscription` / `offline`
/ `error` accordingly.

---

## Screens / Views

All states render inside the **same 384px side-panel shell** from `README.md` (header / body
/ footer). The header shows the brand lockup + a **status badge**; the body is centered for
message states; the footer holds the primary action(s). Reused vocabulary: the **orb** (66×66
rounded-20px icon tile) from the pre-scan empty state, recolored per severity.

### Status badge (header, top-right of the status row)

| State | Badge |
| --- | --- |
| signed in | success · `circle-check` "Signed in" |
| session expired | gray · `log-out` "Signed out" |
| not signed in (sign-in flow) | gray · `lock` "Not signed in" |
| subscription | warning · `circle-alert` "Plan paused" |
| error / offline / ratelimit / update | danger · `circle-x` "Unavailable" |

### Orb severity colors

`primary` (default), `--danger-soft`/`--danger` (error), `--warning-soft`/`#b7791f` (subscription,
locked), `--info-soft`/`--info` (session, update), `--success-soft`/`--success` (signed in),
`--muted`/`--muted-foreground` (offline).

---

### A. Sign in (email) — `screen: email`

- Orb (primary) `wand-sparkles`. H3 **"Sign in to QuikFill"** (17.5px/700). Sub (13px, muted,
  max 280px): "QuikFill fills forms with your saved data. Sign in to start — no password, just
  a code by email."
- Two **feature rows** (30px primary-soft icon tile + 12.5px text): `scan-line` "Scan any form
  and fill it in one click"; `shield-check` "Your values stay on your device."
- **Form**: `Email address` label + `qf-input` with leading `mail` icon, `type=email`,
  `inputmode=email`, `autocomplete=email`, placeholder `you@example.com`.
- **Footer**: primary block **"Send sign-in code"** (`mail`) + centered meta note `lock` "We
  never post or store your password."
- **Action**: submit → `requestCode(email)` → go to **B** (show "Sending…" loading first).

### B. Sending (loading) — `screen: sending`

- Spinning `loader-2` orb, H3 "Sending your code", sub "Emailing a 6-digit code to <email>."
  Footer button disabled with spinner. (~0.85s in prototype; in production, until the request
  resolves.)

### C. Enter code (OTP) — `screen: otp`

- Orb (primary) `mail-check`. H3 **"Enter your code"**. Sub: "We sent a 6-digit code to
  **<email>**. It's good for 10 minutes."
- **6 segmented inputs**, one digit each: 46px max-width × 54px, 22px mono/700, 1.5px border,
  `--radius-lg`. Filled box: `--primary` border + `--primary-soft` bg. Focus: primary border +
  `--shadow-focus` halo.
  - **Behavior**: typing a digit advances focus; Backspace on an empty box steps back and
    clears; ←/→ move between boxes; **paste** of a 6-digit string fills all boxes and focuses
    the first empty; Enter submits when 6 filled. Strip non-digits.
- **Meta row** (below boxes): left `timer` "Expires in m:ss" (count down from 10:00); right a
  `Paste sample code` link (demo affordance — omit or repurpose in prod).
- **Footer**: primary block **"Verify & sign in"** (`check`), **disabled until all 6 filled**.
- **Foot links row**: muted `Different email` (`chevron-left`, → screen A) and primary
  `Resend code` (→ re-request, reset boxes + attempt counter).
- **Action**: verify → `verify(email, code)` → **F** on success; on `INVALID_TOKEN`, decrement
  the local attempt counter and show state **D**; at 0 attempts → **E (locked)**.

### D. Code rejected — `screen: otp`, `otpError: wrong`

- Boxes get danger border + `--danger-soft` bg + a one-time **shake** (0.4s). Danger alert
  (`circle-x`): "That code didn't match. **N attempts left** before it locks." (N = `5 − used`).
- Re-typing clears the error styling. Footer unchanged (Verify).

### E. Code expired / locked — `screen: otp`, `otpError: expired | locked`

- **Expired** (TTL elapsed): warning alert (`timer-off`) "This code expired. Request a new one
  to keep going." Timer row replaced with "Code unavailable."
- **Locked** (attempts exhausted): danger alert (`lock`) "Too many tries — this code is locked.
  Send a fresh code to try again."
- In both, the boxes are inert and the **footer primary becomes "Send a new code"**
  (`rotate-cw`) → re-request + reset.

### F. Verifying (loading) — `screen: verifying`

- Spinning orb, H3 "Verifying…", sub "Checking your code and starting a secure session."

### G. Signed in (success) — `screen: success`

- Orb (success) `check`. H3 **"You're in"**. Sub "Signed in as **<email>**. QuikFill is ready
  on every site." Footer primary **"Start filling"** (`scan-line`) → hands off to the normal
  **pre-scan** state (gate lifted).

### H. Gate lifted (authed pre-scan) — `screen: app`

- The existing pre-scan empty state from `README.md`, with a success alert confirming "Signed
  in as <email>. The gate is lifted." In production this is simply the real fill flow; included
  here so the handoff shows the transition. A demo **"Sign out"** ghost button returns to A.

---

## Blocking states ("can't use it")

Each is a centered message state: severity orb + H3 + sub + optional alert + footer action(s).

| State (`screen`) | Orb / icon | Title | Body copy | Footer |
| --- | --- | --- | --- | --- |
| `error` | danger `triangle-alert` | **Something went wrong** | "QuikFill hit an unexpected error and stopped. Your saved data is safe — nothing on this page was changed." + mono `Reference: req_…` | primary **Try again** (`rotate-cw`) · ghost **Contact support** (`life-buoy`) |
| `subscription` | warning `credit-card` | **Check your subscription** | "Your QuikFill plan is inactive, so filling is paused. Manage your subscription to pick up where you left off." + info alert "Saved profiles and data are kept — they'll work again the moment your plan is active." | primary **Manage subscription** (`external-link`, → dashboard billing) · outline **I've updated it — refresh** (`refresh-cw`, re-check entitlements) |
| `offline` | gray `cloud-off` | **Can't reach QuikFill** | "We couldn't connect to QuikFill. Check your internet connection, then try again." | primary **Retry** (`rotate-cw`) |
| `session` | info `log-out` | **Your session expired** | "For your security you've been signed out after a period of inactivity. Sign in again to keep filling." | primary **Sign in again** (`log-in`, → screen A) |
| `ratelimit` | warning `gauge` | **Too many attempts** | "You've requested too many codes in a short time. Hang tight for a moment, then try again." + meta `timer` countdown | primary disabled **"Try again in m:ss"** → enables to **Sign in again** at 0 |
| `update` | info `arrow-up-circle` | **Update required** | "This version of QuikFill is out of date and can no longer talk to the service. Update to the latest version to continue." + mono `Installed v… · latest v…` | primary **Update QuikFill** (`download`, → Chrome Web Store listing) |

The **"Reference: req_…"** line maps to the backend error envelope's `requestId` (see
`README.md` error shape) — surface it so support can correlate logs.

---

## Popup (toolbar launcher) when gated

The popup stays light and **points to the side panel** — it never hosts the auth form. It
shows a tinted message + a single button to open the panel, varying by state:

- **Not signed in**: primary-tinted `lock` "Sign in to use QuikFill. Filling is only available
  to signed-in accounts." → **"Sign in in the side panel"** (`log-in`).
- **Signed in**: primary-tinted `circle-check` "You're signed in." → **"Open side panel"**.
- **Subscription**: warning-tinted `credit-card` "Plan paused." → **"Open side panel"**.
- **Error / offline / update / ratelimit**: danger-tinted `triangle-alert` "QuikFill is
  unavailable." → **"Open side panel"**.
- Always: a `Help & privacy` row. Header carries the same status badge as the panel.

The toolbar icon's status **dot** reflects state: green (signed in), amber (subscription),
red (error/offline/ratelimit/update), neutral gray (signed out).

---

## State management

A composable in front of `useFillSession`:

```
authState: 'loading' | 'email' | 'sending' | 'otp' | 'verifying' | 'success'
         | 'app' | 'error' | 'subscription' | 'offline' | 'session' | 'ratelimit' | 'update'
otpError:  null | 'wrong' | 'expired' | 'locked'
email:     string
attemptsLeft: number        // starts at OTP_MAX_ATTEMPTS (5), local counter
codeExpiresAt: number       // now + OTP_TTL_MINUTES; drives the countdown → 'expired'
cooldownUntil: number       // for rate-limit countdown
tokens:    { accessToken, refreshToken, expiresIn } // persisted via the storage adapter
```

- **Bootstrap** (panel open): tokens present? → probe an authed endpoint → `app` / `session` /
  `subscription` / `offline` / `error`. No tokens → `email`.
- **Transitions** mirror the dashboard `auth` store; the `INVALID_TOKEN`-uniform rule means the
  attempt counter and TTL are tracked **client-side** to choose `wrong` vs `expired` vs `locked`.
- Persist tokens with the **same chrome storage adapter** the other stores use; clear on logout
  / `session`. Respect `prefers-reduced-motion` (no shake) — already handled globally in tokens.

---

## Design tokens & assets

Identical to `README.md` — lift values from `prototype/theme.css` / `components.css`, but ship
through the repo's Tailwind theme + `@quikfill/ui`. Auth-specific additions:

- **OTP box**: 54px tall, 46px max-width, 22px `--font-mono` 700, 1.5px border, `--radius-lg`;
  filled = `--primary` border + `--primary-soft` bg; error = `--danger` border + `--danger-soft`.
- **Orb severity classes**: see "Orb severity colors" above.
- **Icons** (Lucide): `wand-sparkles, mail, mail-check, check, loader-2, lock, shield-check,
  scan-line, timer, timer-off, rotate-cw, chevron-left, log-in, log-out, triangle-alert,
  credit-card, cloud-off, gauge, arrow-up-circle, download, life-buoy, refresh-cw, circle-check,
  circle-x, circle-alert, info, panel-right-open, settings, circle-help, x`.
- **Logo**: reuse the existing `logo-icon.svg`.

---

## Suggested build order

1. **Auth store** in the extension (port `apps/app/src/stores/auth.ts`) + token persistence via
   the chrome storage adapter; refresh-on-401.
2. **`useAuthGate`** composable + bootstrap resolution; mount it in front of `useFillSession`.
3. **Panel shell** status badge + orb severity variants.
4. **Sign-in flow**: email → sending → OTP (segmented inputs incl. paste/keyboard nav) →
   verifying → success → hand off to pre-scan.
5. **OTP sub-states**: attempt counter (rejected), TTL countdown (expired), lock at max attempts.
6. **Blocking states**: error, subscription, offline, session, ratelimit (cooldown), update —
   each wired to the matching backend signal.
7. **Popup** gated variants + toolbar status dot.
8. Map every state to a real signal and verify recovery paths (retry, resend, re-auth, refresh).

---

## Files for this supplement

```
design_handoff_chrome_extension/
├── README.md                          ← main handoff (fill flow, panel/popup/options)
├── AUTH_STATES.md                     ← this file (auth + blocking states)
└── prototype/
    ├── Auth & States.html             ← clickable reference for everything in this doc
    ├── chrome-extension-prototype.html
    ├── theme.css  ·  components.css    ← token / component values to lift
    └── assets/logo-icon.svg
```
