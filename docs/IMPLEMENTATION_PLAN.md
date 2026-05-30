# Quikfill Frontend — Implementation Plan (Master Roadmap)

This is the living roadmap for `quikfill-frontend`. It expands the iteration
plan in [`requirement.md`](../requirement.md) into concrete, executable detail
and links out to one plan per surface. It mirrors the structure of the backend
plan in the sibling repo (`quikfill-services/docs/IMPLEMENTATION_PLAN.md`).

> **North star:** Quikfill is a **single-user** product. The Chrome extension is
> the primary execution surface; the dashboard manages data; the website sells
> the product. The first implementation is **local-first** but every concept is
> production-shaped, and storage/sync sit behind adapters so the backend can be
> added later without a rewrite.

## Build order (this engagement's focus)

Per the product owner, build the surfaces in this order. The requirement's
iteration sequence already supports it — this just makes the priority explicit:

1. **Chrome extension** — the core experience. Iterations 1–7. → [`CHROME_EXTENSION_PLAN.md`](./CHROME_EXTENSION_PLAN.md)
2. **App (dashboard)** — management surface. Iteration 8. → [`APP_PLAN.md`](./APP_PLAN.md)
3. **Website (marketing)** — public site. Iteration 9. → [`WEBSITE_PLAN.md`](./WEBSITE_PLAN.md)

The shared engine that the extension and app both build on is specified
separately: → [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md).

Backend sync + billing (Iteration 10) is sequenced last and tracks the backend
repo's iterations 4–6.

> ⏸️ **Exploratory — PAUSED (2026-05-30).** A potential **fourth surface**, a
> Figma plugin (`apps/figma-plugin`) that _composes_ the existing shared packages
> (adding only a Figma host-adapter, mirroring how `form-scanner`/`browser-adapter`
> isolate the web/Chrome specifics). Its technical gate — **R2**, whether
> `autofill-core` classifies Figma layer names usefully — is **✅ cleared
> (GO-for-forms: 93% recall / 93% type-precision on a labeled two-tier corpus;
> arbitrary dashboards out of scope)**, and the shared `@quikfill/figma-adapter`
> library landed (built + tested + committed). What was **not** built is the
> `apps/figma-plugin` host app itself — it was designed/approved but never scaffolded.
> **The project is now on hold** pending a **product call: does the web product have
> real users?** plus a named owner (this engagement scopes only the three surfaces
> above). Authoritative done/missing status:
> → [`FIGMA_PLUGIN_STATUS.md`](./FIGMA_PLUGIN_STATUS.md); feasibility brief:
> → [`FIGMA_PLUGIN_PLAN.md`](./FIGMA_PLUGIN_PLAN.md).

## Status

| #   | Iteration                           | Primary surface | Status     |
| --- | ----------------------------------- | --------------- | ---------- |
| 1   | Monorepo Foundation                 | all             | ✅ Done    |
| 2   | Shared Schemas (`packages/schemas`) | all             | ✅ Done    |
| 3   | Scanner Prototype                   | extension       | ✅ Done    |
| 4   | Fill Plan Preview                   | extension       | ✅ Done    |
| 5   | Fill Execution + Undo               | extension       | ✅ Done    |
| 6   | Local Form Profiles                 | extension       | ✅ Done    |
| 7   | Gemini Assistance                   | extension       | ✅ Done    |
| 8   | Dashboard Management                | app             | ✅ Done    |
| 9   | Website                             | website         | ⏳ Planned |
| 10  | Backend Sync + Billing              | extension + app | 🚧 Partial |

> **Iteration 8 note:** built directly against the live backend (`quikfill-services`
> at `/api/v1`) rather than a local mock — per the product owner. This pulls the
> app's slice of Iteration 10 forward: email OTP auth (store + guard + queued
> 401-refresh) and backend-backed CRUD for data, generators, apps, form profiles
> (incl. mapping review) and fill history are **done**. Still outstanding for
> Iteration 10: Stripe billing, the `SyncAdapter`, and the extension's backend
> swap. Subscription + Settings dashboard screens are deferred with them.

> **Design-system pass note:** the extension's three surfaces (popup / side panel /
> options) were rebuilt against the shared design system to match the dashboard —
> a UI pass over the already-built Iterations 3–7, not a new numbered iteration.
> See [`CHROME_EXTENSION_PLAN.md`](./CHROME_EXTENSION_PLAN.md). Added shared
> primitives: `@quikfill/ui` `Switch` + an `ExtensionSettings` schema. Still
> local-first; backend wiring remains Iteration 10.

Update this table (and each surface plan's own status) as work lands.

---

## Tooling & monorepo decisions

These decisions adopt the conventions already proven in the product owner's
`vue3-template` so this repo feels familiar to maintain. Each is a **reversible
default** — change it here and the surface plans inherit it.

| Concern                      | Decision                                                                                                         | Rationale                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager / workspaces | **pnpm@10 workspaces** (`apps/*`, `packages/*`)                                                                  | Matches `vue3-template`. The requirement says "Turborepo-style"; we satisfy the _structure_ with pnpm workspaces and treat Turborepo as an **optional task-runner layer** to add later for caching — not a day-1 dependency.                   |
| App/extension bundler        | **Vite**                                                                                                         | Shared across extension (via WXT), app SPA, and the `web` Nuxt build. One mental model.                                                                                                                                                        |
| Extension framework/build    | **[WXT](https://wxt.dev)** + Vue 3                                                                               | MV3-native, file-based entrypoints, generated manifest, HMR for side panel/content scripts, first-class Vue. See the [extension plan](./CHROME_EXTENSION_PLAN.md#build-tool-decision-wxt) for the WXT-vs-CRXJS rationale and the Vue/CSP note. |
| Dashboard                    | **Vue 3 SPA** (Composition API, `<script setup>`), Vue Router, Pinia, Tailwind v4, shadcn-vue, VeeValidate + Zod | Direct reuse of `vue3-template` patterns.                                                                                                                                                                                                      |
| Website                      | **Nuxt 4** (prerender by default), Tailwind v4                                                                   | Matches `vue3-template/apps/web`.                                                                                                                                                                                                              |
| Validation                   | **Zod 3.x** as the single contract source; VeeValidate via `@vee-validate/zod` for forms                         | `packages/schemas` is canonical; the backend aligns its DTOs 1:1.                                                                                                                                                                              |
| Unit tests                   | **Vitest** per package/app                                                                                       | Logic, schemas, scanner, planner, generators.                                                                                                                                                                                                  |
| E2E                          | **Playwright** (`apps/e2e`), incl. extension harness + fixture HTML pages                                        | Matches `vue3-template`; fixtures exercise scanner/filler on real DOM.                                                                                                                                                                         |
| Lint/format                  | ESLint 9 flat config + Prettier (`prettier-plugin-tailwindcss`), husky pre-commit                                | Matches `vue3-template`.                                                                                                                                                                                                                       |
| Node                         | pinned via `.node-version` (>=20.19)                                                                             | Matches `vue3-template`.                                                                                                                                                                                                                       |

> **Naming note:** the requirement names the apps `website/`, `app/`,
> `chrome-extension/`. We keep those names (not the template's `web`/`app`) so the
> repo matches its own requirement doc. Internal conventions still come from
> `vue3-template`.

---

## Iteration 1 — Monorepo Foundation

**Goal:** every app and package builds from a clean install at the repo root.
No product logic yet — just the skeleton and the quality gate.

**Layout to create**

```txt
quikfill-frontend/
  pnpm-workspace.yaml          # packages: ['apps/*', 'packages/*']
  package.json                 # root scripts (see below), packageManager: pnpm@10
  .node-version                # >=20.19
  eslint.config.js             # ESLint 9 flat config (shared base re-exported from packages/config)
  .prettierrc / .prettierignore
  tsconfig.base.json           # shared compiler options; per-package tsconfig extends it
  .husky/                      # pre-commit gate
  apps/
    chrome-extension/          # WXT + Vue 3 (entrypoints stub: background, content, sidepanel, popup, options)
    app/                       # Vue 3 SPA (Vite) — login shell + empty dashboard layout
    website/                   # Nuxt 4 — landing placeholder
  packages/
    schemas/                   # placeholder export
    autofill-core/             # placeholder export
    form-scanner/              # placeholder export
    browser-adapter/           # placeholder export
    generators/                # placeholder export
    ai/                        # placeholder export
    api-client/                # placeholder export
    ui/                        # shadcn-vue setup + cn() util + one sample component
    config/                    # shared eslint/tailwind/tsconfig/test presets
  docs/                        # these plans
```

**Root scripts** (pnpm filters, mirroring `vue3-template`)

```jsonc
{
  "dev:ext": "pnpm --filter @quikfill/chrome-extension dev",
  "dev:app": "pnpm --filter @quikfill/app dev",
  "dev:web": "pnpm --filter @quikfill/website dev",
  "build": "pnpm -r build",
  "typecheck": "pnpm -r typecheck",
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "test": "pnpm -r test",
  "e2e": "pnpm --filter @quikfill/e2e test",
}
```

**Package naming:** scope everything `@quikfill/*` (e.g. `@quikfill/schemas`),
imported via `workspace:*`.

**Quality gate** (pre-commit + the default "done" bar): `pnpm lint`,
`pnpm format:check`, `pnpm typecheck`, `pnpm build`.

**Exit criteria**

- `pnpm install && pnpm build` succeeds from a clean checkout.
- Each app starts in dev; each package exports a placeholder and type-checks.
- Lint/format/typecheck green.

---

## Shared packages overview

The packages are the **browser-agnostic engine** the extension and dashboard
share. Boundaries are load-bearing — keep DOM/Chrome/Vue out of the core.
Full per-package spec: → [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md).

```txt
schemas ──────────────┐  (Zod contracts; depended on by everything)
                      ▼
generators ──▶ autofill-core ◀── form-scanner        browser-adapter
                      ▲                  (DOM)         (Chrome APIs)
                      │                     \           /
                  ai (contracts)             \         /
                                          chrome-extension (composes all)
api-client ──▶ app / extension (backend I/O)        ui ──▶ app + extension
config ──▶ everything (eslint/tailwind/tsconfig/test presets)
```

Dependency rules (enforced by review, ideally by lint boundaries):

- `autofill-core` must **not** import DOM, Chrome, Vue, Nuxt, or backend clients.
- `form-scanner` is DOM-aware but **not** Chrome- or Vue-aware.
- `browser-adapter` is the only package allowed to touch `chrome.*`.
- `ai` holds contracts + privacy helpers only — **never** an API key; production
  AI calls route through `quikfill-services`.

---

## Cross-cutting conventions (apply to every surface)

Adopted from `vue3-template/CLAUDE.md` and the requirement's agent rules.

**Vue code**

- Composition API only; `<script setup lang="ts">`. No Options API.
- Pinia _setup_ stores own shared state; views call store actions, never mutate
  refs or browser storage directly. Stores may call APIs/utils but **not**
  composables (composables may wrap stores).
- Forms use `useFormValidation(schema)` (wraps VeeValidate + `toTypedSchema`);
  `defineField()` not raw `useField()`; validate on blur/change; every validated
  input gets `:aria-invalid`.

**Contracts & data**

- `packages/schemas` (Zod) is the single source of truth for every cross-package
  and AI contract. Backend DTOs align 1:1 (see [backend relationship](#relationship-to-the-backend)).
- Parse untrusted input (API responses, storage hydration, **all** AI output)
  with Zod before trusting it.

**Storage & sync**

- All persistence sits behind adapter interfaces (`StorageAdapter`,
  `SyncAdapter`) defined in Iteration 2. Local-first first; backend sync swaps in
  without touching feature code.
- Never put sensitive form values in `chrome.storage.sync`.

**AI**

- Review-first: AI **interprets**, the user confirms, AI never fills the page.
- Send minimized, redacted field summaries — never full HTML, never current
  values by default. No model key in any bundle.

**Product invariants** (from requirements — do not regress)

- Never identify a form by URL alone (use the fingerprint/profile match).
- Never hard-code a single site, domain, or plan limit inside components.
- Keep extension permissions minimal and request tab access on user action.

**Styling/a11y:** Tailwind v4 semantic classes (`bg-background`, `text-foreground`,
…); `cn()` from `packages/ui`; class-based dark mode; icon-only buttons need
`aria-label`; active nav uses `aria-current="page"`.

---

## Relationship to the backend

`quikfill-services` is already building toward this frontend. Alignment points:

- **Contracts:** the backend's _Contracts Appendix_ (FillSource,
  `FieldMapping.target`, FormProfile structure, FieldSummary, AiSuggestion,
  EntityFieldDef, GeneratorRule) is the interim source of truth **until
  `packages/schemas` exists**. Once it does, the Zod schemas become canonical and
  the backend aligns names 1:1. Build `packages/schemas` to match those shapes.
- **Auth:** passwordless email one-time code (OTP) → backend-issued JWT access
  tokens + rotating refresh sessions. The app's auth store/adapter mirrors `vue3-template`
  (queued 401 refresh, centralized auth header, cancellable requests).
- **AI:** the extension/app call backend `POST /ai/classify-fields` /
  `/ai/suggest-mappings` — never Gemini directly.
- **Sync:** `GET /sync/snapshot?since=` + `POST /sync/push` (last-write-wins by
  `updatedAt`, client-supplied UUIDs make push idempotent). `packages/api-client`
  wraps these; `SyncAdapter` consumes them.

Backend readiness (from its plan): Auth ✅, Users ✅; Data Library / Form Model /
Sync / AI / Stripe are in flight. The frontend stays local-first until the
matching backend iteration is ready, then flips the adapter.

---

## How to execute an iteration

1. Read the matching section of [`requirement.md`](../requirement.md) **and** the
   relevant surface plan in this folder.
2. Build only that iteration; preserve package boundaries and product invariants.
3. Add/extend Zod schemas first when contracts change; derive types with `z.infer`.
4. Write Vitest unit tests for logic (schemas, scanner, matching, planner,
   generators) and Playwright tests for app/website + scanner/filler fixtures.
5. Keep the quality gate green: `pnpm lint`, `pnpm format:check`,
   `pnpm typecheck`, `pnpm build`.
6. Update the [Status](#status) table here and the surface plan's own status,
   then open one focused PR per iteration (split if large).
