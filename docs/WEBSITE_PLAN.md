# Website (Marketing) — Implementation Plan

`apps/website` is the **public-facing** surface that explains and sells Quikfill
and directs visitors to the Chrome extension and the dashboard. Parent roadmap:
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

> **Built last** (Iteration 9), after the extension and dashboard exist so the
> site can use **real product screenshots** instead of placeholders.

## Status

| #   | Iteration                                                     | Status                                                                                           |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 9   | Marketing website (pages, pricing, docs/support placeholders) | 🚧 In progress — landing page (`/`) built 1:1 from design; product/extension/docs routes pending |

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

## Pages (MVP)

| Route        | Page                   | Notes                                                                                            |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `/`          | Landing                | hero, value prop, primary CTA → Chrome Web Store + "Open dashboard"                              |
| `/product`   | Product overview       | how scan→preview→fill→save works; field-support honesty; AI-as-suggestion                        |
| `/extension` | Chrome extension       | install steps, permissions explained, supported field levels                                     |
| `/pricing`   | Pricing                | plan tiers; **read tiers from a single config**, don't scatter limits across components          |
| `/docs`      | Docs / getting started | quick start, FAQs, troubleshooting (placeholder structure OK)                                    |
| `/support`   | Support / contact      | contact form or mailto; links to docs                                                            |
| `/privacy`   | Privacy                | placeholder — must reflect the real privacy posture (no full HTML, redacted values, mediated AI) |
| `/terms`     | Terms                  | placeholder                                                                                      |

## Content alignment

The marketing copy must stay **honest** and consistent with the product:

- Quikfill is cross-site form automation, single-user, local-first with optional
  sync — not tied to one app or vertical.
- AI **interprets**, the user confirms; Quikfill doesn't silently fill or send
  full page HTML.
- Be upfront about field-support levels (some controls — closed shadow DOM,
  canvas, hostile pages — aren't reliably fillable).

## Iteration 9 — Website

**Build:** Nuxt 4 app, the pages above, shared layout/header/footer, pricing from
a single config source, docs/support/privacy/terms placeholders, SEO meta +
prerender config, CTAs to the Web Store listing and the dashboard.
**Tests:** Playwright smoke tests (each route renders, nav works, primary CTAs
resolve); Lighthouse/prerender sanity for the landing page.
**Exit:** the public site can explain Quikfill and direct users to the
app/extension.

## Guardrails

- No Chrome/extension dependencies; keep the bundle clean of product engine code.
- Pricing/plan tiers in one config — never hard-coded across pages.
- Swap placeholder media for real screenshots before launch.
