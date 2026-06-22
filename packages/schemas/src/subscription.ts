import { z } from 'zod'
import { isoDateTime, nullableOptional } from './common'

/**
 * Subscription / billing contracts (mirror the backend `subscriptions` module).
 *
 * The product is sold and metered in **form fills** — one AI form fill (a single
 * /ai/fill call) is one unit, regardless of form size. See `./usage` for the
 * gating helpers and `./plan-catalog` for the static marketing catalogue. Only
 * backend AI fills draw down the budget; scanning and filling from saved data are
 * always free. (Raw tokens are tracked server-side for cost only — never here.)
 */

/** The four subscription tiers. `free` is the no-card entry point. */
export const planKeySchema = z.enum(['free', 'starter', 'pro', 'enterprise'])
export type PlanKey = z.infer<typeof planKeySchema>

/** The paid tiers — the only ones that can start a Stripe Checkout. */
export const paidPlanKeySchema = z.enum(['starter', 'pro', 'enterprise'])
export type PaidPlanKey = z.infer<typeof paidPlanKeySchema>

/**
 * Stripe-derived subscription lifecycle status. The backend persists Stripe's raw
 * `subscription.status` verbatim, so this must mirror Stripe's full status set —
 * all eight values, including `incomplete_expired`, `unpaid`, and `paused`. (An
 * earlier, narrower enum omitted those three, so a user in any of them failed the
 * whole `/entitlements` parse and bricked the popup.)
 */
export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

/**
 * `GET /entitlements` response — the live plan + usage for the current user.
 * `fillLimit === 0` means the tier is uncapped (unlimited AI). `currentPeriodEnd`
 * is `null` for free users, so it uses {@link nullableOptional} (a plain
 * `.optional()` would reject the explicit `null` and fail the whole parse).
 */
export const entitlementsResponseSchema = z.object({
  planKey: planKeySchema,
  displayName: z.string(),
  // Display-only in the popup (a text suffix on the plan line) and never used to
  // gate AI, so tolerate a value Stripe introduces later by falling back to a safe
  // known state rather than throwing — a single unexpected status must never brick
  // the whole entitlements panel. The enum above already covers every current
  // Stripe status; `.catch` is the forward-compat safety net.
  status: subscriptionStatusSchema.catch('active'),
  fillsUsed: z.number().int().nonnegative(),
  fillLimit: z.number().int().nonnegative(),
  currentPeriodEnd: nullableOptional(isoDateTime),
})
export type Entitlements = z.infer<typeof entitlementsResponseSchema>

/** `POST /subscriptions/checkout-session` request — the paid plan to buy. */
export const createCheckoutSessionInputSchema = z.object({
  planKey: paidPlanKeySchema,
})
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionInputSchema>

/**
 * `POST /subscriptions/checkout-session` and `/portal-session` response — a
 * Stripe-hosted URL the client redirects to (`window.location.href = url`).
 */
export const sessionUrlResponseSchema = z.object({
  url: z.string().url(),
})
export type SessionUrlResponse = z.infer<typeof sessionUrlResponseSchema>
