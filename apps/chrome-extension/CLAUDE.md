# `@quikfill/chrome-extension` — CLAUDE.md

> Repo-wide rules (forms, components, shared UI, conventions, quality gate) live in
> the root [`../../CLAUDE.md`](../../CLAUDE.md). They apply here too — this file
> only adds extension-specific context.

## What this is

The **primary product surface**. It scans a page, detects fields, matches saved
profiles, optionally asks AI for help, builds a previewable fill plan, fills
fields, verifies results, supports undo, and saves form profiles. Built first.

Plan: [`../../docs/CHROME_EXTENSION_PLAN.md`](../../docs/CHROME_EXTENSION_PLAN.md).
Engine: [`../../docs/SHARED_PACKAGES_PLAN.md`](../../docs/SHARED_PACKAGES_PLAN.md).

## Stack & structure

- **WXT** (`wxt.config.ts`) + Vue 3 + Vite + Tailwind v4. MV3-native, file-based
  entrypoints, generated manifest, typed messaging + `storage` helpers, HMR.
- Entrypoints under `entrypoints/`: `background.ts`, `content.ts` (+
  `content/overlay.ts` for the in-page UI), and the Vue popup UI `popup/`
  (`App.vue` + `main.ts` + `index.html`). The old `sidepanel/` + `options/`
  surfaces are retired under `apps/chrome-extension/legacy/` (outside
  `entrypoints/`, so WXT never builds them).

```bash
pnpm dev:ext      # or: pnpm --filter @quikfill/chrome-extension dev
pnpm --filter @quikfill/chrome-extension build   # zip: ... zip
```

## Extension-specific rules

- **The extension composes shared packages — it does not reimplement them.**
  Scanning, planning, generation, and contracts come from `@quikfill/form-scanner`,
  `@quikfill/autofill-core`, `@quikfill/generators`, `@quikfill/schemas`.
- **Chrome-specific code lives only in `@quikfill/browser-adapter`** and these
  entrypoints. Never call `chrome.*` from feature logic or other packages.
- UI in the popup uses `@quikfill/ui` (shadcn) — see root rules 2–4.
  Forms (e.g. profile/mapping editors) use Zod + VeeValidate — root rule 1.
- Keep **permissions minimal** (`activeTab`, `scripting`, `storage`, `alarms`);
  `activeTab` is granted on the popup-open gesture, not eagerly.
- Never identify a form by URL alone — use the fingerprint/profile match.
- AI is review-first and privacy-aware: send redacted field summaries, never full
  HTML or current values; route AI calls through the backend, never Gemini direct.

## Current state

Iterations 3–7 are **done**: scan, fill-plan preview, fill execution + undo,
local form profiles, and Gemini assistance (privacy-aware AI — redacted
summaries, schema-validated suggestions, review/accept/reject; the background
worker owns the api-client call, fails gracefully when the backend is offline).

**Scanner & filler robustness** (lives in `@quikfill/form-scanner` /
`@quikfill/autofill-core`, not here):

- Scans **exclude non-fillable fields** (`disabled`/`readonly`) by default — so
  site-computed inputs don't show as noise. `ScanOptions.includeNonFillable`
  opts back in.
- **Label resolution** falls back to the nearest single-control container
  `<label>`, so "cousin layout" fields with no `name`/`id` still get a real label
  instead of `qf-N`.
- Fills are **mask-aware**: the proposed value is coerced to a `data-maska`
  pattern (e.g. a phone country code is dropped, not shifted into the area code),
  then verified ignoring formatting — a reformatted value is a success, not a
  false "failed".
- Autocomplete-driven inputs (Google Places, flagged via
  `DetectedField.autocompleteHint`) use the **`assistedAutocomplete`** strategy:
  type the value to surface the suggestion dropdown for the user to pick, never
  auto-completing them. Reported with the `assisted` fill-result status.
- The overlay Fill flow runs a **scan-time probe** (`probeFields`) before the AI
  call: each on-demand custom select is briefly opened, its REAL options are
  harvested (ARIA → structural → mutation-diff tiers), and it is closed again.
  Custom selects are then picked **locally at random** from the harvested set —
  they never go to the AI; a list that renders no options (async/remote) is
  marked `remoteOptions` and left blank. Text inputs that open a calendar gain a
  `datepicker` widget descriptor plus the calendar's proven `min`/`max`, which
  ARE sent to the AI so its proposed date lands inside the picker's range (the
  filler types first, then falls back to clicking the nearest enabled day).

**Live surface (v2): the toolbar popup.** The single live UI is the toolbar
**popup** — passwordless email-OTP sign-in → a subscription/usage mini-dashboard
with a **Manage** link to the dashboard app and a Sign out. There is no
in-extension scan/settings UI. Auth screens live in `components/auth/`; a
`useAuthGate` composable (`lib/useAuthGate.ts`) wraps the background session
(`createBackgroundAuth` + `useAuth`) and drives the screen machine (sign-in →
sending → OTP → verifying → success → app) plus the blocking states (error /
subscription / offline / session / ratelimit / update). Forms validate via Zod +
VeeValidate through the shared `useFormValidation` (now in `@quikfill/ui`).

**Filling happens on the page**, not in the popup: the content script
(`content.ts` + `content/overlay.ts`) auto-detects forms and injects an isolated
Shadow-DOM floating **Fill** button that calls the backend `POST /ai/fill` and
prefills via the existing `applyFill`. Full reference:
[`../../docs/CHROME_EXTENSION_FLOW.md`](../../docs/CHROME_EXTENSION_FLOW.md).

**Backend settings-sync is shipped:** `background.ts` wires `createBackgroundSync`

- `hydrateSettings` + a periodic alarm, so dashboard-managed settings hydrate
  into `chrome.storage` and the overlay applies them — no longer a future
  iteration.
