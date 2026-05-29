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

Iteration 8 (dashboard management) is **planned**; today `src/` is an auth/layout
shell (`SignIn`, `Dashboard`, `NotFound` placeholders). Magic-link auth + backend
data + Stripe billing land in Iteration 10. See the plan's status table.
