# Frontend Subscriptions — Design

> Date: 2026-05-30
> Scope: `frontend/apps/app`, `frontend/apps/chrome-extension`,
> `frontend/apps/website`, and the shared `@quikfill/schemas` +
> `@quikfill/api-client` packages.
> Backend status: **complete** (Iteration 6). This spec covers frontend only.

## 1. Background & source of truth

The backend Stripe subscription + entitlements module is already built and
production-ready. The authoritative behavioral contract is the backend concept
doc **`services/docs-site/docs/concepts/billing-and-subscriptions.md`** (served
at `http://localhost:3001/services/concepts/billing-and-subscriptions`). Where
this spec and that doc disagree, **the doc wins**.

### Key facts from the doc (the contract)

**Dual-layer pricing model.** Users see a friendly **"Form Fills"** metric;
the backend enforces quota on raw **AI tokens** (input + output). One standard
form ≈ **250 tokens**. `TOKENS_PER_FILL = 250` is the conversion constant.

**Only backend AI consumes quota.** Scanning, profile matching, filling from
saved data, and generators are **unlimited and free on every tier**. Only
Tier-2 backend AI classification (`POST /ai/classify-fields`,
`/ai/suggest-mappings`) draws down the monthly token budget. (Tier-1 on-device
Gemini Nano, where available, bypasses the backend and does not count — but the
extension does not implement Tier-1 today and this spec does not add it.)

**Subscription tiers (authoritative marketing numbers):**

| Plan       | Price     | AI tokens / month | ≈ Form Fills | Audience                           |
| ---------- | --------- | ----------------- | ------------ | ---------------------------------- |
| Free       | $0        | 2,500 (default)   | **~10**      | Evaluation / first-time            |
| Starter    | $12 / mo  | 500,000           | **~1,500**   | Solo devs & freelance QA           |
| Pro Tester | $29 / mo  | 2,000,000         | **~6,000**   | Full-time manual QA (Most popular) |
| Enterprise | $99+ / mo | 8,000,000+        | **~20,000+** | QA agencies & teams                |

`tokenLimit === 0` means **Unlimited** for that tier.

> **Correction this spec applies:** the current
> `frontend/apps/website/components/PricingSection.vue` advertises Starter
> ~2,000 / Pro ~8,000 / Enterprise 32,000+ (a flat 250 tok/fill computation).
> The doc deliberately publishes _conservative_ numbers (~1,500 / ~6,000 /
> ~20,000+). The website will be corrected to the doc's numbers.

**Hard-stop protocol.** When the monthly token limit is exhausted, AI endpoints
return `HTTP 429` with body `{ code: "QUOTA_EXCEEDED", message: "...",
limitExceeded: true }`. The `limitExceeded: true` flag tells the extension to
suppress the raw error and show a clean overlay with this exact copy:

> **Monthly Limit Reached.** You have successfully utilized your full allowance
> of Form Fills for this billing cycle! Your quota will automatically reset on
> your next billing date. Need to keep testing today? Upgrade to the Pro Tester
> or Enterprise plan.

Counters reset automatically: paid users on the `invoice.paid` webhook; free
users lazily on the first AI call of a new calendar month.

**Backend API (already built):**

| Method | Path                                     | Description                         |
| ------ | ---------------------------------------- | ----------------------------------- |
| `GET`  | `/api/v1/entitlements`                   | Current plan, token usage, limits   |
| `POST` | `/api/v1/subscriptions/checkout-session` | → Stripe Checkout URL               |
| `POST` | `/api/v1/subscriptions/portal-session`   | → Stripe Customer Portal URL        |
| `POST` | `/api/v1/webhooks/stripe`                | Stripe lifecycle (server-side only) |

`GET /entitlements` response shape:

```json
{
  "planKey": "starter",
  "displayName": "Starter",
  "status": "active",
  "tokensUsed": 12340,
  "tokenLimit": 500000,
  "currentPeriodEnd": "2026-06-29T00:00:00.000Z"
}
```

Status values: `active | trialing | past_due | canceled | incomplete`.
Checkout redirects to `${APP_URL}/billing/success?session_id=...` and
`${APP_URL}/billing/cancel`. Stripe over-quota / rate-limit → 429
`QUOTA_EXCEEDED`. Billing endpoints respond `503` when Stripe is unconfigured.

### Confirmed product decisions

1. **No free trial.** The Free tier is the no-card entry point. CTAs read
   "Get started free" / "Upgrade" — never "Start free trial".
2. **Enterprise is self-serve checkout** (the `STRIPE_ENTERPRISE_PRICE_ID`
   exists) — not "Contact sales".
3. **CE soft-gates AI only.** When out of quota, the "Ask AI" action is
   disabled with an upsell; manual scan/fill/generators keep working.
4. **Live usage display** = percentage + exact `tokensUsed / tokenLimit` tokens
   - a friendly "≈ N form fills used" helper. No marketing fills-denominator on
     the live gauge (avoids >100% glitches from mixing computed numerator with a
     marketing denominator).
5. **Single source of truth.** Plan catalog lives in `@quikfill/schemas`;
   app, CE, and website all consume it.

## 2. The display model

| Surface         | What it shows                                             | Source                        |
| --------------- | --------------------------------------------------------- | ----------------------------- |
| Website pricing | Marketing "≈ Form Fills" per tier + price + features      | `PLAN_CATALOG` (doc numbers)  |
| App plan cards  | Same marketing catalog                                    | `PLAN_CATALOG`                |
| App usage gauge | % used + exact `tokensUsed/tokenLimit` + "≈ N fills used" | live `/entitlements`          |
| CE usage chip   | % used / "≈ fills left" + gated state                     | live `/entitlements` (cached) |
| CE AI gate      | Doc's "Monthly Limit Reached" copy + upgrade CTA          | live `/entitlements` + 429    |

- `tokenLimit === 0` → render **"Unlimited"** everywhere; no gauge, no gating.
- Friendly fills: `fillsUsed = ceil(tokensUsed / 250)`,
  `usagePercent = tokenLimit > 0 ? min(100, round(tokensUsed / tokenLimit * 100)) : 0`.
- Marketing fills per tier are **static strings from the catalog** (the doc's
  hand-tuned, conservative numbers), not computed — so the catalog never
  contradicts the doc.

## 3. Shared foundation — `@quikfill/schemas` + `@quikfill/api-client`

### 3.1 `packages/schemas/src/subscription.ts` (new)

Zod schemas (validated at the API boundary like all other client responses):

- `planKeySchema = z.enum(['free', 'starter', 'pro', 'enterprise'])`
- `paidPlanKeySchema = z.enum(['starter', 'pro', 'enterprise'])`
- `subscriptionStatusSchema = z.enum(['active','trialing','past_due','canceled','incomplete'])`
- `entitlementsResponseSchema`:
  - `planKey: planKeySchema`
  - `displayName: z.string()`
  - `status: subscriptionStatusSchema`
  - `tokensUsed: z.number().int().nonnegative()`
  - `tokenLimit: z.number().int().nonnegative()` (0 = unlimited)
  - `currentPeriodEnd: nullableOptional(isoDateTime)` — **uses
    `nullableOptional()` not `.optional()`** (schema-null convention: backend
    returns `null` for free users; `.optional()` would throw on parse).
- `createCheckoutSessionInputSchema = z.object({ planKey: paidPlanKeySchema })`
- `sessionUrlResponseSchema = z.object({ url: z.string().url() })`
- Exported inferred types: `PlanKey`, `PaidPlanKey`, `SubscriptionStatus`,
  `Entitlements`, `CreateCheckoutSessionInput`, `SessionUrlResponse`.

### 3.2 `packages/schemas/src/plan-catalog.ts` (new) — the single source of truth

```ts
export const TOKENS_PER_FILL = 250

export interface PlanCatalogEntry {
  key: PlanKey
  displayName: string // "Pro Tester"
  priceUsdCents: number // 0 | 1200 | 2900 | 9900
  priceLabel: string // "$0" | "$12" | "$29" | "$99+"
  pricePer: string // "/ forever" | "/ mo"
  tokenLimit: number // default; live value comes from /entitlements
  marketingFills: string // "~10" | "~1,500" | "~6,000" | "~20,000+"  (doc)
  tagline: string // target audience line
  featureBullets: { text: string; muted?: boolean }[]
  recommended?: boolean // Pro Tester
  selfServe: boolean // false for free, true for starter/pro/enterprise
}

export const PLAN_CATALOG: PlanCatalogEntry[] // ordered free→enterprise
export const planByKey: (k: PlanKey) => PlanCatalogEntry
```

Feature bullets mirror the existing website copy (already accurate), adjusted so
each tier reads "Everything in <previous> +". Numbers come **only** from the doc.

### 3.3 `packages/schemas/src/usage.ts` (new) — pure helpers

`tokensToFills(tokens)`, `usagePercent(used, limit)`, `fillsRemaining(used, limit)`,
`isUnlimited(limit)`, `formatTokenUsage(used, limit)` (e.g. `"12,340 / 500,000"`),
`isOverQuota(used, limit)`, `isNearQuota(used, limit, threshold = 0.9)`.
All pure, unit-tested, no I/O.

### 3.4 `packages/api-client` — `subscriptions` namespace

Add to the client interface (validated with the new schemas):

```ts
subscriptions: {
  entitlements(signal?): Promise<Entitlements>                       // GET /entitlements
  createCheckoutSession(input, signal?): Promise<SessionUrlResponse> // POST .../checkout-session
  createPortalSession(signal?): Promise<SessionUrlResponse>          // POST .../portal-session
}
```

Wired identically in both app (`apps/app/src/lib/api.ts`) and CE (background
service worker), reusing each surface's existing auth/refresh plumbing.

## 4. `frontend/apps/app` — Manage Subscription

### 4.1 Routes (`src/router/index.ts`)

- `/billing` — main page (`requiresAuth`, `app` layout).
- `/billing/success` — post-checkout return handler.
- `/billing/cancel` — checkout-canceled handler.
- `/settings` gains a **summary card** ("Plan: Pro Tester · 48% used") linking
  to `/billing`.
- `/billing` reads an optional `?plan=<key>` query (used by website CTAs after
  sign-in): it **highlights** that plan card and scrolls to it. It does **not**
  auto-start checkout — the user still clicks "Upgrade" (no surprise charges).

### 4.2 `useSubscriptionStore` (Pinia, `src/stores/subscription.ts`)

State: `entitlements: Entitlements | null`, `loading`, `error`.
Actions:

- `fetch()` → `api.subscriptions.entitlements()`.
- `startCheckout(planKey)` → get URL, `window.location.href = url`.
- `openPortal()` → get URL, `window.location.href = url`.
- `refetchUntilChanged(prevPlanKey, { tries, delayMs })` → used on
  `/billing/success` to poll past webhook lag (a few attempts with backoff).

Errors routed through the existing `useApiError` composable. A `503` from
billing endpoints surfaces a friendly "Billing isn't available right now."

### 4.3 `/billing` page (all `@quikfill/ui`)

1. **Current-plan card** — `displayName`, `priceLabel`, **status badge**
   (active=neutral/green, trialing=blue, past_due=amber, canceled=muted),
   renewal/`currentPeriodEnd` date, **"Manage payment & invoices"** button →
   Stripe Portal. Card updates, cancellation, and plan switching all happen in
   the Portal — **no custom card forms** in our UI.
2. **Usage card** — `usagePercent` progress bar + "≈ {fillsUsed} form fills
   used this cycle" + exact "{tokensUsed} / {tokenLimit} AI tokens" +
   "Resets {currentPeriodEnd}". When `tokenLimit === 0` → "Unlimited AI" with no
   bar.
3. **Plans grid** — renders `PLAN_CATALOG`; current plan badged "Current";
   each other paid plan shows an **Upgrade/Downgrade** button →
   `startCheckout(key)` (**Enterprise included — self-serve**). Free shows no
   purchase button.
4. **`past_due` banner** — non-blocking warning at top: "Payment failed —
   update your card to avoid losing AI access." → Portal.
5. **`canceled`** — treated as Free (access falls back), with a **re-subscribe**
   CTA.

### 4.4 Return handlers

- **`/billing/success`** — read `session_id` (informational only), call
  `refetchUntilChanged`, `toast.success("You're on the <plan> plan 🎉")`,
  `router.replace('/billing')`.
- **`/billing/cancel`** — `toast("Checkout canceled")`, `router.replace('/billing')`.

### 4.5 Copy

Drop all "free trial" language → "Get started free" / "Upgrade to <plan>".

## 5. `frontend/apps/chrome-extension` — informative + AI soft-gate

**Principle (from the doc):** _"QuikFill keeps filling from saved data — only AI
pauses until next cycle."_ Manual scan / match / preview / fill / generators are
**never** gated. Only Tier-2 backend AI is.

### 5.1 Background owns entitlement state

Mirrors the existing auth/profile ownership pattern (background service worker is
the single session owner; surfaces read via `chrome.storage` + `onChanged`).

- Background fetches `/entitlements` **after sign-in**, **on side-panel open**,
  and **after any AI 429**, caching the result in
  `chrome.storage.local['entitlements:current']`.
- New `lib/useEntitlements.ts` composable: reactive read of the cached
  entitlements + derived `usagePercent`, `fillsRemaining`, `isOverQuota`,
  `isNearQuota`, `isUnlimited`.
- A lightweight messaging handler (`getEntitlements` / `refreshEntitlements`)
  added alongside the existing background auth handlers.

### 5.2 Side panel

- **Header usage chip** — compact "≈ {fillsRemaining} fills left" or
  "{percent}%"; tone neutral <90%, **amber ≥90%**, **red at 100%**. Hidden when
  `isUnlimited`. (`fillsRemaining` is computed from the real `tokenLimit`, not a
  marketing number.)
- **Settings panel detail** — current plan, usage line, reset date, and a
  **"Manage plan"** deep-link that opens the app's `/billing` in a new tab.
- **AI soft-gate** — in `lib/useFillSession.ts` `askAi()`:
  - **Proactive:** if `isOverQuota`, the "Ask AI" affordance is **disabled**
    with an inline note: "Monthly AI limit reached — upgrade to keep using AI.
    Manual fill still works." + "Upgrade" link → app `/billing`. Preview/fill
    from saved + generator sources continues unaffected.
  - **Reactive:** if an AI call returns `limitExceeded: true` (429), show the
    doc's exact **"Monthly Limit Reached"** copy inline at the AI step, then
    `refreshEntitlements()` so the action flips to its gated state. This reuses
    the existing AI `reason: 'quota'` inline path — it is **not** a full-app
    block.

### 5.3 Gate separation (critical)

- AI quota (429 `limitExceeded`) stays **inline** at the AI step. It must
  **not** escalate to the auth gate's blocking `ratelimit` or `subscription`
  screens. Those global blocking screens remain for **auth-endpoint** failures
  only (e.g. too many OTP requests, expired session).
- `past_due` / `canceled` render a **non-blocking** info strip in the side
  panel, never a hard block. `canceled` simply behaves as Free (the backend
  falls usage back to the free limit). The dormant 402 `payment-required`
  full-app `subscription` screen is **not** used for quota — the backend never
  hard-blocks billing states.

### 5.4 Popup

Small plan/usage line ("Pro · ≈ 1,200 fills left") + "Open side panel"; reflects
the gated state in its existing messaging.

## 6. `frontend/apps/website` (Nuxt 4)

- **Bind `PricingSection.vue` to `PLAN_CATALOG`** from `@quikfill/schemas`
  (replaces the hardcoded `tiers` array). Bespoke marketing CSS unchanged — only
  the data source changes.
- **Numbers corrected** to the doc (10 / 1,500 / 6,000 / 20,000+; $0/$12/$29/$99;
  Pro = "Most popular").
- **CTAs wired** to the app entry. Free/Starter/Pro/Enterprise →
  app sign-in → `/billing?plan=<key>` (so a freshly-authenticated user lands on
  billing with the intended plan preselected for checkout). **Enterprise is
  self-serve checkout** too. Replace "Start free trial" with "Get started" /
  "Upgrade".
- Keep the existing accurate explanatory copy ("unlimited from saved data, only
  AI is metered; hit your limit and QuikFill keeps filling from saved data").

## 7. Out of scope (YAGNI)

- No Stripe trial period.
- No custom card / payment-method forms (Stripe Customer Portal owns card
  updates, cancellation, and plan switching).
- No usage-based / metered overage billing.
- No teams / seats (QuikFill is single-user).
- No Tier-1 on-device AI implementation.
- No backend changes — the module is complete. (We will verify that
  `APP_URL` and the Stripe price-ID env vars are set in the environments we
  test against, but write no backend code.)

## 8. Testing

- **Shared:** unit tests for `usage.ts` helpers (incl. unlimited + boundary
  cases) and a **consistency test** asserting the website renders the same
  numbers as `PLAN_CATALOG` (catches drift in CI per the chosen approach).
- **App:** `useSubscriptionStore` tests (fetch / checkout-redirect / portal /
  poll-on-success); `/billing` component tests for loading / error / usage /
  past_due / canceled / unlimited states.
- **CE:** `useEntitlements` derivation tests; soft-gate behavior tests
  (proactive disable when over quota, reactive 429 → inline gate, manual fill
  unaffected, no escalation to global blocking screens).
- All numeric assertions reference the doc's values via `PLAN_CATALOG`.

## 9. Sequencing (one spec, dependency order)

1. **Shared** — `@quikfill/schemas` (subscription schemas, plan catalog, usage
   helpers) + `@quikfill/api-client` `subscriptions` namespace.
2. **App** — `/billing` route, store, page, return handlers, settings card.
3. **CE** — background entitlements ownership, `useEntitlements`, side-panel
   chip + settings detail, AI soft-gate, gate separation.
4. **Website** — bind pricing to catalog, correct numbers, wire CTAs.

Each step ends green (lint/typecheck/test/build) before the next begins.
