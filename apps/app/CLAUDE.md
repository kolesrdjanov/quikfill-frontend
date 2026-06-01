# `@quikfill/app` — CLAUDE.md

> Repo-wide rules (forms, components, shared UI, conventions, quality gate) live in
> the root [`../../CLAUDE.md`](../../CLAUDE.md). They apply here too — this file
> only adds dashboard-specific context.

## What this is

The **management surface (dashboard)** — not the filling experience. It manages
account, subscription/billing, saved data, generator presets, domains, form
profiles, mappings, and fill history, over the **same data model** the extension
uses. The dashboard must never be required for a first successful extension fill.

Plan: [`../../docs/APP_PLAN.md`](../../docs/APP_PLAN.md).

## Stack & structure

- Vue 3 SPA + Vite + Tailwind v4. Pinia, Vue Router, VeeValidate + Zod.
- `src/`: `views/`, `layouts/` (`AuthLayout`, `AppLayout`), `router/`, `assets/`,
  `App.vue`, `main.ts`.
- Routes use lazy views with `meta: { layout, requiresAuth, title }` and an auth
  guard; cancel in-flight requests on navigation.

```bash
pnpm dev:app      # or: pnpm --filter @quikfill/app dev
pnpm --filter @quikfill/app build   # build runs vue-tsc typecheck first
```

## Dashboard-specific rules

- **Dense, scannable, productivity-tool layout** — not a marketing page.
- All UI from `@quikfill/ui` (shadcn); shared confirm dialogs/modals/buttons come
  from there too — root rules 2–4. No custom UI components.
- Every form uses `useFormValidation(schema)` (VeeValidate + `@vee-validate/zod`),
  `defineField()`, validate on blur/change, `:aria-invalid` on inputs — root rule
  1. Schemas come from `@quikfill/schemas`.
- Pinia **setup** stores own state; views call actions, never mutate refs or
  storage directly; stores don't call composables.
- Backend I/O goes through `@quikfill/api-client` (centralized auth header,
  queued-401 refresh, cancellable requests); handle errors in catch blocks.

## Current state

Iteration 8 is **done**, built against the **live backend** (`/api/v1`, Vite proxy
→ `localhost:4010`; dev server pinned to `:5173` for CORS). Implemented:

- **Auth:** passwordless email OTP — a two-step `SignIn` (request a 6-digit code,
  then enter it), `stores/auth.ts`, token module (`lib/auth-tokens.ts`), router
  guard, and the `@quikfill/api-client` singleton (`lib/api.ts`) with a queued
  401-refresh.
- **Views:** `Home`, `Data` (entity types + records), `Generators`, `Apps`,
  `FormProfiles` + `FormProfileDetail` (mapping review), `FillHistory`, `Settings`,
  and `Billing` (+ `BillingSuccess` / `BillingCancel`).
- **Stores:** one Pinia setup store per resource; **forms** via
  `useFormValidation(schema)` with Zod schemas in `src/schemas/forms.ts`;
  `useApiError()` + `useTheme()` composables; UI from `@quikfill/ui` (shadcn-vue).

**Settings** and **Subscription/Billing** screens are built — `/settings`,
`/billing`, `/billing/success`, `/billing/cancel`, with Billing wiring Stripe
Checkout/Portal via `api.subscriptions`. Deferred to a follow-up: the
`SyncAdapter` and the server-side Stripe wiring (Iteration 10).
