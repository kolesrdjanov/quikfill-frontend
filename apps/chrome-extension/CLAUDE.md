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
- Entrypoints under `entrypoints/`: `background.ts`, `content.ts`, and Vue UIs
  `popup/`, `sidepanel/`, `options/` (each `App.vue` + `main.ts` + `index.html`).

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
- UI in popup/sidepanel/options uses `@quikfill/ui` (shadcn) — see root rules 2–4.
  Forms (e.g. profile/mapping editors) use Zod + VeeValidate — root rule 1.
- Keep **permissions minimal**; request tab access on a user action, not eagerly.
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

The **UI design-system pass** is also done: popup, side panel, and options are
rebuilt against the shared tokens + `@quikfill/ui` to match the dashboard. The
side panel runs on a `useFillSession` composable (`lib/useFillSession.ts`) that
wraps the existing package calls — behaviour is unchanged. Surface-local
composition components live in `components/`; shared helpers in `lib/`. Settings
persist locally via an `ExtensionSettings` schema + `useSettings`.

**Auth gate (Iteration 10):** the side panel and popup are now gated by
passwordless email-OTP sign-in. A `useAuthGate` composable (`lib/useAuthGate.ts`)
sits in front of `useFillSession`: it wraps the background session
(`createBackgroundAuth` + `useAuth`) and derives the design's screen machine —
sign-in → sending → OTP (6 segmented boxes, paste/keyboard nav) → verifying →
success → app — plus the blocking states (error / subscription / offline /
session / ratelimit / update). The OTP attempt counter, 10-min TTL, and
rate-limit cooldown are tracked **client-side** because `/auth/verify` returns a
uniform `INVALID_TOKEN`. Auth screens live in `components/auth/`; the toolbar
badge reflects the session from `background.ts`. Forms validate via Zod +
VeeValidate through the shared `useFormValidation` (now in `@quikfill/ui`). Next:
Iteration 10 — backend **sync** (swap the local `StorageAdapter`). See the
plan's status table.
