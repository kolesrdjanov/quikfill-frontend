# App (Dashboard) — Implementation Plan

> **Status (deployed shape):** the live surface has since been **trimmed** to
> sign-in + Settings (Billing / Account / Setup) + Admin (Analytics, Beta Users).
> The full dashboard routes described below are **commented out** in
> `apps/app/src/router/index.ts` (built but disabled). Billing now lives at
> `/settings/billing` (not `/subscription`). See the **"Billing-only deployment"**
> section of [`../apps/app/CLAUDE.md`](../apps/app/CLAUDE.md).

`apps/app` is the **management surface**, not the filling experience. It manages
account, subscription/billing, saved data, generator presets, domains, form
profiles, mappings, and fill history — over the **same data model** the extension
uses. Parent roadmap: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
Engine: [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md).

> **Built second** (Iteration 8), after the extension can scan/fill/save locally.
> The dashboard must never be required for a first successful extension fill.

## Status

| #   | Iteration                                                                  | Status     |
| --- | -------------------------------------------------------------------------- | ---------- |
| 8   | Dashboard management (data, generators, apps, profiles, mappings, history) | ✅ Done    |
| 10  | Auth + backend-backed data + Stripe billing (with extension)               | 🚧 Partial |

> **Built against the live backend** (`/api/v1`, Vite proxy → `localhost:4010`),
> not a local mock — the product owner chose live wiring. Done: email OTP auth
> (a two-step `SignIn` — request a 6-digit code, then verify it — token store,
> router guard, queued 401-refresh in
> `@quikfill/api-client`), brand design tokens ported to `packages/config/theme.css`,
> shadcn-vue UI kit expanded, and backend-backed CRUD for **Home, Data
> (types+records), Generators, Apps, Form Profiles + `/form-profiles/:id` mapping
> review, Fill History**. **Settings** and **Subscription/Billing** screens have
> since landed too (Billing wires Stripe Checkout/Portal via `api.subscriptions`).
> Deferred to a follow-up: the `SyncAdapter` and the server-side Stripe wiring in
> `quikfill-services`.

## Stack & conventions

Direct reuse of `vue3-template/apps/app`:

- Vue 3 SPA, Composition API only, `<script setup lang="ts">`, Vite.
- Vue Router (lazy views, `meta: { layout, requiresAuth, title }`, auth guard,
  request cancellation on navigation).
- Pinia **setup** stores own shared state; views call actions, never mutate refs
  or storage directly; stores don't call composables.
- Tailwind v4 (semantic classes), shadcn-vue via `@quikfill/ui`, `cn()`.
- Forms: `useFormValidation(schema)` (VeeValidate + `@vee-validate/zod`),
  `defineField()`, validate on blur/change, `:aria-invalid` on every validated
  input, `useApiError().handleError()` in catch blocks.
- API: Axios instance with centralized auth header, queued-401-refresh, cancellable
  requests — delegated to `@quikfill/api-client`.
- **Dense, scannable, productivity-tool** layout — not a marketing page.

**Layering** (mirrors the template):

```txt
views → composables/stores → @quikfill/api-client → backend
   ↘ @quikfill/schemas (Zod) for forms + response parsing + storage hydration
   ↘ layouts (Auth/App) selected by route.meta.layout → @quikfill/ui
```

## Navigation (recommended)

`Home · Data · Generators · Apps · Form Profiles · Fill History · Subscription · Settings`

| Route                | Purpose                                                   | Key schema(s)                  |
| -------------------- | --------------------------------------------------------- | ------------------------------ |
| `/` (Home)           | overview: recent fills, counts, quick links               | FillRun, Domain                |
| `/data`              | entity types + records (the Data Library) CRUD            | EntityType, EntityRecord       |
| `/generators`        | generator presets + rules CRUD, preview output            | GeneratorPreset, GeneratorRule |
| `/apps`              | domains/apps CRUD (name, hostnames[])                     | Domain                         |
| `/form-profiles`     | profiles per domain; view fingerprint/structure metadata  | FormProfile                    |
| `/form-profiles/:id` | mapping review: target, fill source, strategy, confidence | FieldMapping, FillSource       |
| `/fill-history`      | fill runs (redacted), filter by profile, pagination       | FillRun                        |
| `/subscription`      | plan state + Stripe checkout/portal entry points          | Subscription, entitlements     |
| `/settings`          | account, AI prefs, locale, redaction defaults             | UserAccount                    |
| `/sign-in`           | email OTP: request a code, then verify it (auth layout)   | —                              |

> **Mapping review** is the dashboard's most valuable screen: it's where a user
> curates the mappings the extension applies. Show target selectors, fill source,
> strategy, confidence, and `lastSuccessfulFillAt`; allow edit/delete and source
> reassignment. Edits write back through the same contracts the extension reads.

## Data sourcing: local-first, then synced

- **Iteration 8 (local-first):** the dashboard reads/writes the **same local data**
  the extension owns. Two clean options — pick one and document it:
  1. Read directly from the extension's storage via a small bridge, or
  2. (Recommended) Operate on the shared model through `@quikfill/api-client`
     against a **local/mock adapter**, so the only change at Iteration 10 is
     swapping the adapter base URL to the real backend.
- **Iteration 10 (backend):** flip `api-client` to `quikfill-services`; add the
  auth store (email OTP → JWT + refresh, mirroring `vue3-template`'s auth store
  and interceptor); data becomes per-user and synced.

## Subscription & entitlements

- `/subscription` calls `POST /subscriptions/checkout-session` and
  `/portal-session` (Stripe URLs) and reads `GET /entitlements`.
- **Never hard-code plan limits in components.** The backend's `/entitlements` is
  the single source of truth; the UI reads the limits map and renders
  accordingly (e.g. AI monthly limit, max form profiles). Gate features off the
  resolved entitlements object.

## Iteration 8 — Dashboard management

**Build:** the routes above (data, generators, apps, form profiles, mapping
review, fill history) on local-first data; subscription + settings **shells**
(wired to real Stripe/auth at Iteration 10). shadcn-vue layout shell with the
nav, Auth/App layouts.
**Forms:** every create/edit form is a Zod schema in `apps/app/src/schemas/` +
`useFormValidation`; entity-record forms validate values against the parent
`EntityType.fields` (subset + required), mirroring the backend rule.
**Tests:** Vitest for store/composable logic + schema-validated forms; Playwright
for CRUD flows on each route and the mapping-review edit path.
**Exit:** the dashboard manages the same data model as the extension.

## Iteration 10 — Auth + backend + billing

**Build:** auth store + email OTP flow; `api-client` pointed at the backend;
`SyncAdapter` so dashboard and extension converge (last-write-wins by `updatedAt`,
client UUIDs); Stripe checkout/portal live; entitlements drive feature gates.
**Tests:** auth guard + 401-refresh queue; entitlement-driven gating; sync
round-trip (push then snapshot reflects changes); ownership (a user only sees
their own records).
**Exit:** dashboard uses backend-backed, per-user data without rewriting
local-first logic.

## Guardrails

- Share schemas with the extension — never fork the contracts.
- Keep marketing/website design out of the dashboard `ui`.
- Don't bury plan limits in components; read entitlements.
- Views never mutate stores/storage directly; parse untrusted input with Zod.
