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

Marketing website — **LIVE**, redesigned 2026-06-22 to the dark-technical
"tool for power users" look (near-black canvas, electric blue + teal, JetBrains
Mono detailing, animated aurora + scroll reveals). This reflects the **current**
product behaviour: an in-page floating **Fill** button on every form, NOT the
deprecated side-panel scan/preview wizard. All CTAs enabled; "Add to Chrome"
buttons point at `runtimeConfig.public.chromeStoreUrl` (a `https://google.com`
placeholder until the public CWS listing exists), "Sign in" / pricing CTAs
deep-link `appUrl`.

`pages/index.vue` composes the one-page site: `SiteNav` (incl. a real mobile
menu + dark/light `useTheme` toggle), `HeroSection` (kinetic rotator, count-up
stats, and `ProductMock` — the auto-playing browser **Fill** demo cycling 3
forms), `FlowSection` (#flow), `CapabilitiesSection` (#capabilities bento with
live mini-visuals), `PrivacySection` (#privacy), `PricingSection` (#pricing),
`FaqSection` (#faq, bespoke Q&As), `FinalCta`, `SiteFooter`. Recreated from the
`design_handoff_website_redesign` HTML/CSS prototype, re-expressed idiomatically
in Vue/Nuxt.

Bespoke marketing CSS system in `assets/css/main.css` (own CSS variables:
`--bg/--fg/--blue/--teal/...`), intentionally separate from the shadcn
dashboard/extension UI; reuse limited to the logo, `lucide-vue-next` icons, and
the shared Google Fonts link (Plus Jakarta Sans + JetBrains Mono). Motion lives
in small composables (`useReveal`, `useCursorGlow`, `useNavScroll`,
`usePrefersReducedMotion`) and all of it respects `prefers-reduced-motion`.

**Pricing copy stays bound to `@quikfill/schemas` `PLAN_CATALOG`** (the single
source of truth: Free 10 / Starter 200 / Pro 1,000 / Enterprise 10,000 fills,
honest bullets, no token line). The handoff's pricing (token quotas, fabricated
features) is deliberately ignored — only its UI was applied. Likewise the
handoff's FAQ copy is unused; `FaqSection` carries its own accurate Q&As.
