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

## Deploying (Cloudflare Worker — `app-quikfill`)

Deployed as a **Cloudflare Worker serving static assets** (assets-only, no server
code), config in [`wrangler.jsonc`](wrangler.jsonc). We **build locally and upload
a pre-built `dist/`** — Cloudflare never runs `pnpm install`, which is deliberate:
the monorepo's git-based Cloudflare _Pages_ builds fail on Linux (esbuild
postinstall collision + pnpm not materializing oxc-parser/native Linux bindings).
Workers + `wrangler deploy` sidesteps that entirely.

```bash
# From the monorepo root, after `pnpm install`. NOTE the `run` — `deploy` is a
# reserved pnpm built-in, so `pnpm --filter X deploy` (without `run`) fails with
# ERR_PNPM_INVALID_DEPLOY_TARGET. `run` forces the package script.
pnpm --filter @quikfill/app run deploy          # = pnpm build && wrangler deploy
pnpm --filter @quikfill/app run deploy:dry-run  # validate config + bundle, no upload
# First time, log in: pnpm --filter @quikfill/app exec wrangler login
# (or set CLOUDFLARE_API_TOKEN).
```

- **Build env:** baked in at build time from committed [`.env.production`](.env.production)
  (`vite build` always runs in production mode) — `VITE_QF_API_BASE_URL` +
  `ALLOWED_USERS`. Only `VITE_*` and `ALLOWED_USERS` reach the bundle (see
  `vite.config.ts` `envPrefix`).
- **SPA routing:** `assets.not_found_handling: "single-page-application"` in
  `wrangler.jsonc` serves `index.html` for non-asset paths (deep links / reloads).
  Security headers (CSP) ship via [`public/_headers`](public/_headers) — Workers
  assets honor `_headers`; copied to `dist/` by Vite.
- **Custom domain:** `app.quikfill.io`, bound via the `routes` entry
  (`custom_domain: true`); wrangler provisions DNS + cert on the `quikfill.io`
  zone. Comment it out to deploy to the `*.workers.dev` URL first.
- **Backend prerequisite:** `https://app.quikfill.io` must be in the
  `quikfill-services` **CORS allowlist**; `https://api.quikfill.io` is already in
  the CSP `connect-src`. Keep the two in sync.

> The **website** (`apps/website`, Nuxt) still targets Cloudflare **Pages**
> separately.
