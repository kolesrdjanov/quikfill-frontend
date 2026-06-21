# QuikFill Frontend — Conventions (read first)

This is the authoritative contract for `quikfill-frontend`. It applies to **every**
app and package in this repo. Per-surface detail lives in each app's own
`CLAUDE.md`; the living roadmap lives in [`docs/`](./docs) (start at
[`IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md)).

## What QuikFill is

QuikFill is a **single-user**, local-first form-autofill product. It scans a web
page, detects fields, matches saved profiles, optionally asks AI for help, builds
a previewable fill plan, fills fields, and supports undo.

- **Chrome extension** (`apps/chrome-extension`) — the primary execution surface.
- **App / dashboard** (`apps/app`) — currently a trimmed live surface: sign-in +
  Settings (Billing / Account / Setup) + Admin. The full dashboard (data,
  profiles, generators, history) is built but its routes are disabled; see
  [`apps/app/CLAUDE.md`](./apps/app/CLAUDE.md).
- **Website** (`apps/website`) — public marketing site.

Every concept is production-shaped: storage/sync/AI sit behind adapters so the
backend (`quikfill-services`, sibling repo) can be added later without a rewrite.

## Repo layout

```txt
apps/
  chrome-extension/   # WXT + Vue 3 (MV3). Primary surface.
  app/                # Vue 3 SPA (Vite) — dashboard.
  website/            # Nuxt 4 — marketing.
  e2e/                # Playwright.
packages/
  schemas/            # Zod contracts — single source of truth, depended on by all.
  ui/                 # shadcn-vue components + cn() — the ONLY component library.
  autofill-core/      # browser-agnostic engine (NO DOM/Chrome/Vue).
  form-scanner/       # DOM-aware, NOT Chrome/Vue-aware.
  browser-adapter/    # the only package allowed to touch chrome.*
  generators/  ai/  api-client/  config/
  assets/             # shared brand/logo/icon assets, consumed by app + extension.
  figma-adapter/      # paused 4th-surface adapter library — see docs/FIGMA_PLUGIN_STATUS.md.
docs/                 # roadmap + per-surface plans.
```

Package manager: **pnpm@10 workspaces**. Everything scoped `@quikfill/*`, imported
via `workspace:*`. Stack: Vue 3 (Composition API + `<script setup lang="ts">`),
Vite, Tailwind v4, Pinia, Vue Router / Nuxt 4 / WXT, Vitest + Playwright.

---

## Golden rules (standard practice — non-negotiable)

These exist to keep the codebase consistent. Follow them on every change.

### 1. Forms: Zod + VeeValidate only — no custom validation

Every form is validated, and every required field is enforced. Validation is
**always** Zod schemas wired through VeeValidate (`@vee-validate/zod`). Never
hand-roll validation logic (no manual `if (!value)` checks, no ad-hoc error refs,
no regex scattered in components).

- The schema is the source of truth. Reuse/extend schemas from
  `@quikfill/schemas` where a contract exists; derive types with `z.infer`.
- Wrap forms with the shared `useFormValidation(schema)` composable (VeeValidate +
  `toTypedSchema`); use `defineField()`, not raw `useField()`.
- Validate on blur/change; put `:aria-invalid` on every validated input.

### 2. Components come from `@quikfill/ui` — shadcn only

All UI components are pulled from `packages/ui` and must be **shadcn-vue**
components. Do not build custom UI components in an app.

- The **only** exception is a strictly logical / feature-specific component —
  something 100% specific to one feature with no reuse value. UI/presentational
  pieces never qualify.
- Need a primitive that doesn't exist yet? Add it to `@quikfill/ui` via shadcn-vue
  (`style: new-york`, `lucide` icons), then consume it — don't inline it.

### 3. Never re-implement a component — reuse the existing one

If a component already exists for a purpose, use it the same way everywhere.
Behaviour is expressed through **props on one component**, not new variants.

- One phone-number input, one email input, one text input — a single input
  component driven by props (`type`, validation behaviour, etc.), not three
  near-duplicate components.
- Before creating anything, search for an existing usage and mirror it exactly.
  Diverging "just here" is how the library fragments.

### 4. Shared UI + utils live in `@quikfill/ui`

Confirm/"are you sure" dialogs, modals, buttons, toasts, and all shared UI and
UI-related utilities live in `packages/ui` and are imported by every app. If two
surfaces would need the same thing, it belongs in `@quikfill/ui`, not copied.

---

## Other standing conventions

- **Composition API only.** No Options API.
- **Pinia setup stores** own shared state; views call store actions, never mutate
  refs or storage directly. Stores may call APIs/utils but **not** composables.
- **Parse untrusted input** (API responses, storage hydration, all AI output) with
  Zod before trusting it.
- **Persistence sits behind adapters** (`StorageAdapter`, `SyncAdapter`).
  Local-first first; never put sensitive form values in `chrome.storage.sync`.
- **AI is review-first:** AI interprets, the user confirms; AI never fills the
  page. Send minimized/redacted field summaries — never full HTML or values. No
  model key in any bundle; production AI routes through `quikfill-services`.
- **Styling/a11y:** Tailwind v4 semantic classes (`bg-background`,
  `text-foreground`, …), `cn()` from `@quikfill/ui`, class-based dark mode.
  Icon-only buttons need `aria-label`; active nav uses `aria-current="page"`.
- **Product invariants:** never identify a form by URL alone; never hard-code a
  single site/domain/plan-limit in components; keep extension permissions minimal.

## Quality gate (the "done" bar, also pre-commit)

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test        # Vitest
pnpm e2e         # Playwright, when behaviour changed
```

Keep all green before considering work done. Add/extend Zod schemas first when
contracts change; write Vitest for logic and Playwright for app/website + scanner/
filler fixtures. Update the relevant `docs/` status table as work lands.
