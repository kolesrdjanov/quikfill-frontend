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

## Installed MV3 release gate (2026-10-22)

The dedicated `@quikfill/e2e test:mv3` suite installs a production-mode bundle in a
fresh Chromium profile and drives the actual toolbar. It covers worker restart,
optional cloud and developer reload. Popup startup pings the active content script
and repairs missing receivers with activeTab while retaining healthy Undo sessions.
[Release checks](../../docs/RELEASE_MV3_CHECKS.md).

## Current state

**Phase 4 optional cloud (2026-10-22):** AI suggestions require per-field review;
saved-data mode uses one selected account record and always preserves existing values.
Account caches/sync and auth retries are isolated. See
[optional cloud](../../docs/PHASE_4_OPTIONAL_CLOUD.md).

**Phase 3 QA (2026-10-22):** signed-out popup scenarios persist seeds and field
rules locally. Activated recipes match exact origin/path/form identities and run
through the existing local session. Retry touches only failed, unchanged original
controls and retains the first Undo state. Boundary/invalid cases are explicit.
See [QA scenarios](../../docs/PHASE_3_QA_SCENARIOS.md).

**Phase 2 widgets (2026-10-22):** `fillLocalSession` refreshes scoped metadata
between dependent fields while retaining original DOM bindings, waits for async
options/enablement and includes conditional controls. Fill and Undo verify actual
widget state. Tested libraries and limits:
[widget adapters](../../docs/PHASE_2_WIDGET_ADAPTERS.md).

**Phase 1 local fill (2026-10-22):** the main overlay action composes
`buildLocalFillPlan` and `applyFill`, with no AI/auth/entitlements/history call.
Only-empty is the default; popup local preferences expose locale, optional seed,
and explicit overwrite. Sign-in is optional; AI assist lives in the result panel
and never gates local filling. Activation settings persist locally through a
background outbox; execution preferences remain device-local. See
[`../../docs/PHASE_1_LOCAL_FILL.md`](../../docs/PHASE_1_LOCAL_FILL.md).

**Phase 0 stabilization (2026-10-22):** the live overlay locks concurrent fills,
binds original fields within the chosen form, times out/cancels stale requests,
reports every target (including omitted/assisted ones), and offers guarded undo.
WXT invalidation destroys the overlay and aborts pending work. Regression browser
fixtures cover the real engine and overlay; the Chrome transport is mocked.
See [`../../docs/PHASE_0_STABILIZATION.md`](../../docs/PHASE_0_STABILIZATION.md).

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
- The overlay probes only eligible empty/explicit-overwrite widgets before local
  planning. Custom choices come from enabled harvested options; remote options
  remain manual. Datepicker bounds feed the local date generator. The executor
  verifies the exact date/option and never substitutes a nearby value or submits.

**Live surfaces:** filling happens in the in-page Shadow-DOM overlay. The toolbar
popup opens to a compact overview with Sign in in the header and collapsed local
preferences, saved data, QA scenarios and per-site controls. Auth screens remain in
`components/auth/`. A pending emailed-code sign-in resumes automatically when the
popup reopens, including after worker suspension; its email, original deadline and
remaining attempts persist in the token-free local auth snapshot. Signed-in users also see account usage/dashboard controls.
Forms use Zod + VeeValidate via shared `useFormValidation`.

**Settings:** `background.ts` composes `createBackgroundSettings` for local-first
activation/appearance writes and a durable account outbox. Sign-in, periodic
alarms and manual sync reconcile pending writes before pulling remote settings.
`settings:local-fill` stores device-local execution preferences separately and
never syncs to the backend. Chrome transport/global substitution is limited to
browser fixtures; installed MV3 behavior still needs release verification.
