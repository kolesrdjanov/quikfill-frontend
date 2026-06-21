# Website (Marketing) — Implementation Plan

`apps/website` is the **public-facing** surface that explains and sells QuikFill
and directs visitors to the Chrome extension and the dashboard. Parent roadmap:
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

> **Built last** (Iteration 9), after the extension and dashboard exist so the
> site can use **real product screenshots** instead of placeholders.

## Status

| #   | Iteration                                                     | Status                                                                                                                                     |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 9   | Marketing website (pages, pricing, docs/support placeholders) | ✅ Live (2026-06-21) — single-page site (`/`) built 1:1 from design; `/privacy` standalone; product/extension/docs/pricing routes descoped |

## Stack & conventions

Mirrors `vue3-template/apps/web`:

- **Nuxt 4**, TypeScript, file-based routing under `pages/`.
- **Hybrid rendering, prerender by default** (static marketing pages → fast,
  SEO-friendly). Use SSR/ISR only where a page needs it.
- Tailwind v4 (shared preset); may share **presentational** primitives from
  `@quikfill/ui`, but marketing design stays separate from dashboard/extension UI.
- Nuxt auto-imports for `components/`.

**Hard rules (from requirements):**

- **No Chrome APIs.** **No extension-only packages** (`browser-adapter`,
  `form-scanner`, `autofill-core`, etc.). The website is pure marketing.
- Use real product screenshots once the extension/dashboard are shippable.

## Pages (as built)

The site shipped as a **single composite landing page** at `/` plus a standalone
`/privacy` page — only these two routes exist (`pages/index.vue` + `pages/privacy.vue`;
`nuxt.config.ts` prerenders exactly `['/', '/privacy']`). The planned
`/product`, `/extension`, `/pricing`, `/docs`, `/support`, and `/terms` routes
were **not built / descoped**; their content (where kept) lives as in-page
sections on `/`, reached via anchors (`/#how`, `/#features`, `/#pricing`).

| Route      | Page                  | Notes                                                                                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/`        | Landing (single-page) | composes in-page sections: Hero, HowItWorks, Features, Privacy, Pricing, FinalCta; primary CTA → Chrome Web Store + "Open dashboard" |
| `/privacy` | Privacy               | standalone page — reflects the real privacy posture (no full HTML, redacted values, mediated AI)                                     |

**Descoped (not built):**

| Planned route | Where it went                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/product`    | folded into the `/#how` (HowItWorks) + `/#features` in-page sections                                                                                                                     |
| `/extension`  | not built — install/CTA handled by the hero + FinalCta Chrome Web Store CTAs                                                                                                             |
| `/pricing`    | not a route — pricing is the in-page `#pricing` section (`PricingSection`); **tiers read from a single config** (`PLAN_CATALOG`, `@quikfill/schemas`), never scattered across components |
| `/docs`       | not built                                                                                                                                                                                |
| `/support`    | not built                                                                                                                                                                                |
| `/terms`      | not built                                                                                                                                                                                |

## Content alignment

The marketing copy must stay **honest** and consistent with the product:

- QuikFill is cross-site form automation, single-user, local-first with optional
  sync — not tied to one app or vertical.
- AI **interprets**, the user confirms; QuikFill doesn't silently fill or send
  full page HTML.
- Be upfront about field-support levels (some controls — closed shadow DOM,
  canvas, hostile pages — aren't reliably fillable).

## Iteration 9 — Website

**Build:** Nuxt 4 app, the pages above, shared layout/header/footer, pricing from
a single config source, docs/support/privacy/terms placeholders, SEO meta +
prerender config, CTAs to the Web Store listing and the dashboard.
**Tests:** Playwright smoke tests (each route renders, nav works, primary CTAs
resolve); Lighthouse/prerender sanity for the landing page.
**Exit:** the public site can explain QuikFill and direct users to the
app/extension.

## Guardrails

- No Chrome/extension dependencies; keep the bundle clean of product engine code.
- Pricing/plan tiers in one config — never hard-coded across pages.
- Swap placeholder media for real screenshots before launch.
