# Honest pricing copy — design

**Date:** 2026-06-22
**Status:** Approved → implemented
**Scope:** the subscription plan catalogue (`packages/schemas/src/plan-catalog.ts`), which
both the marketing website pricing grid (`apps/website` `PricingSection`) and the app
billing page (`apps/app` `Billing.vue`) render.

## Problem

The pricing packages advertised features the product does not offer. Verified against the
backend (`quikfill-services`) and the client code:

| Claim                             | Tier       | Reality                                                                                                                                                                      |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SSO & team management**         | Enterprise | **Fabricated and architecturally impossible** — QuikFill is single-user by hard rule (every record is owned by exactly one `userId`; no team/org/SSO model exists anywhere). |
| **Priority field classification** | Starter    | **Fabricated** — `AiService.classifyFields` is identical for every user/plan; there is no priority queue or per-tier model.                                                  |
| **Dedicated support & SLA**       | Enterprise | No system in code; no operational support tier exists today.                                                                                                                 |
| **Email support**                 | Starter    | No system in code; no operational support tier exists today.                                                                                                                 |
| **Seedable generators for QA**    | Pro (perk) | **Real but free** — generators are a client-side feature for all users; the website Features section already advertises "seedable" to everyone. Not plan-gated.              |
| **Profile sync across devices**   | Pro (perk) | **Real but free** — two-way profile sync genuinely ships in the extension (`createBackgroundSync`), but it is **not** entitlement-gated, so every user gets it.              |

The only real, plan-gated difference between tiers is the **monthly AI-fill quota**
(`enforceFillQuota` on `subscription.fillsUsed`; `AI_*_MONTHLY_FILLS` = 10 / 200 / 1000 /
10000). Prices, quotas, "unlimited manual fill", Gemini classification, and
redacted/never-auto-submit behaviour are all true.

## Decision

**Make the copy honest now; do not build features yet.** (The alternatives — building real
plan-gated differentiators, or restructuring the tiers — were considered and deferred.)

- Remove the **fabricated** bullets: "Priority field classification", "SSO & team
  management".
- Cut the **unbacked support** bullets: "Email support", "Dedicated support & SLA" (no
  support tier exists today).
- Move the **real-but-free** features ("seedable generators", "cross-device sync") onto the
  **Free** tier where they truthfully belong, instead of presenting them as paid perks.
- Fix two adjacent untruths: Enterprise's tagline "QA agencies & testing teams" (implies
  multi-user) → "High-volume QA & power users"; and `$99+` → `$99` (one flat self-serve
  price exists; the `+` implied custom pricing that does not).

Net effect: every paid tier is honestly _"the full product + a higher monthly AI-fill
limit"_, and Free shows off the genuinely-free feature set. Paid cards are leaner; the
prominent per-card fill-count number carries the "you are buying AI volume" message
(presentation option A — data-only change, no component edits).

## The honest catalogue

| Tier       | Price | Fills/mo | Bullets                                                                                                                                     |
| ---------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0    | 10       | Unlimited manual scan, fill & undo · Saved profiles, records & seedable generators · Cross-device profile sync · _10 AI form fills / month_ |
| Starter    | $12   | 200      | Everything in Free · 200 AI form fills / month                                                                                              |
| Pro Tester | $29   | 1,000    | Everything in Starter · 1,000 AI form fills / month                                                                                         |
| Enterprise | $99   | 10,000   | Everything in Pro Tester · 10,000 AI form fills / month                                                                                     |

## Regression guard

A comment in `plan-catalog.ts` records the honesty constraint: do **not** re-add paid-tier
bullets (SSO/teams, priority classification, support/SLA) unless they are actually built
and entitlement-gated in `quikfill-services`.

## Deferred (not in scope here)

- Building real plan-gated differentiators (e.g. gating sync/seedable generators to paid,
  a genuine priority/quality lane).
- Rethinking the tier structure (the only real axis today is fill volume).
- Other marketing-truthfulness items outside the pricing packages (e.g. the hero's
  "Live on …" fictional demo hostnames).
