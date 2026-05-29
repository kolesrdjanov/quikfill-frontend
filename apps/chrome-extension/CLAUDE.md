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

Iterations 3–6 (scan, fill-plan preview, fill execution + undo, local form
profiles) are **done**. Next: Iteration 7 — Gemini assistance (privacy-aware AI,
review/accept/reject). See the plan's status table.
