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

## Billing-only deployment (current shape)

This surface is intentionally trimmed to **sign-in + the subscription screen**
for the `app.quikfill.io` deployment:

- The dashboard routes (Home, Data, Generators, Apps, Form Profiles, Fill
  History, Settings) are **commented out** in [`src/router/index.ts`](src/router/index.ts)
  (not deleted) and dropped from the [`AppLayout`](src/layouts/AppLayout.vue) nav.
  `/` redirects to `/billing`. Restore by un-commenting both together.
- **Sign-in allowlist:** the email step is gated by `ALLOWED_USERS` (semicolon-
  separated, [`src/lib/allowed-users.ts`](src/lib/allowed-users.ts) +
  `signInEmailSchema`). It's a **soft UX gate only** — the list ships in the
  bundle and the backend still serves any valid session, so real access control
  must live in `quikfill-services`. Empty/unset => open.

## Deploying (Cloudflare Pages)

- **Build command:** `pnpm --filter @quikfill/app build` (monorepo root) — runs
  `vue-tsc` then `vite build`.
- **Output directory:** `frontend/apps/app/dist`.
- **SPA fallback:** [`public/_redirects`](public/_redirects) (`/* /index.html 200`)
  makes deep links / reloads resolve to the SPA. Security headers ship via
  [`public/_headers`](public/_headers); both are copied to `dist/` by Vite.
- **Build env vars** (set in the Pages dashboard — only `VITE_*` and
  `ALLOWED_USERS` reach the bundle, see `vite.config.ts` `envPrefix`):
  - `VITE_QF_API_BASE_URL=https://api.quikfill.io/api/v1`
  - `ALLOWED_USERS=colio.subs@gmail.com;eivansavic@gmail.com`
- **Backend prerequisites:** `https://app.quikfill.io` must be in the
  `quikfill-services` **CORS allowlist**, and `https://api.quikfill.io` is already
  in the CSP `connect-src`. Keep the two in sync.
