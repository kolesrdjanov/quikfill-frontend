# `@quikfill/website` — CLAUDE.md

> Repo-wide rules (components, shared UI, conventions, quality gate) live in the
> root [`../../CLAUDE.md`](../../CLAUDE.md). They apply here too — this file only
> adds website-specific context.

## What this is

The **public marketing site** that explains and sells Quikfill and directs
visitors to the Chrome extension and the dashboard. Built last, so it can use real
product screenshots instead of placeholders.

Plan: [`../../docs/WEBSITE_PLAN.md`](../../docs/WEBSITE_PLAN.md).

## Stack & structure

- **Nuxt 4**, TypeScript, file-based routing under `pages/`, Tailwind v4.
- **Hybrid rendering, prerender by default** (static, fast, SEO-friendly). Use
  SSR/ISR only where a page actually needs it.
- Nuxt auto-imports `components/`. Entry: `app.vue`, config: `nuxt.config.ts`.

```bash
pnpm dev:web      # or: pnpm --filter @quikfill/website dev
pnpm --filter @quikfill/website generate   # static; build / preview also available
```

## Website-specific rules (hard limits from requirements)

- **No Chrome APIs. No extension-only packages** — never import
  `@quikfill/browser-adapter`, `@quikfill/form-scanner`, `@quikfill/autofill-core`,
  etc. The website is pure marketing.
- May share **presentational** primitives from `@quikfill/ui`, but marketing
  design stays visually separate from the dashboard/extension UI. Still no custom
  one-off UI components — extend `@quikfill/ui` if a shared primitive is missing
  (root rules 2–4).
- Use real product screenshots once the extension/dashboard are shippable.

## Current state

Iteration 9 (marketing website) is **planned**; today it's a landing placeholder
(`app.vue` + `pages/index.vue`). See the plan's status table.
