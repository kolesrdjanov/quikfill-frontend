# `@quikfill/website` — CLAUDE.md

> Repo-wide rules (components, shared UI, conventions, quality gate) live in the
> root [`../../CLAUDE.md`](../../CLAUDE.md). They apply here too — this file only
> adds website-specific context.

## What this is

The **public marketing site** that explains and sells QuikFill and directs
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

Iteration 9 (marketing website) — **LIVE (2026-06-21)**. All CTAs enabled,
PricingSection shown. Chrome Web Store links are a `https://google.com`
placeholder via `runtimeConfig.public.chromeStoreUrl`, pending the real CWS
listing. The hero uses the animated `ProductMock`; real product screenshots are
a post-launch follow-up.

`pages/index.vue` composes the full one-page marketing site (`components/Site*`,
`HeroSection` — which itself renders `ProductMock` — `HowItWorks`,
`FeaturesSection`, `PrivacySection`, `PricingSection`, `FinalCta`), ported 1:1
from the `QuikFill (standalone).html` design. It uses a bespoke dark-premium
marketing CSS system (`assets/css/main.css`, own CSS variables) intentionally
separate from the shadcn dashboard/extension UI; reuse is limited to the
`@quikfill/assets` logo, `lucide-vue-next` icons, and the shared Google Fonts
link. Dark/light theme toggle (`useTheme`, persisted to `qf-theme`), nav-scroll
state, and the scan→preview→fill panel animation (`ProductMock`, ported from the
design's `anim.js`) are all live. See the plan's status table.
