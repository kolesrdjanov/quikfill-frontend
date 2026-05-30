import type { PlanKey } from './subscription'

/**
 * The static plan catalogue — the single source of truth for *marketing* plan
 * metadata (prices, feature bullets, the friendly "≈ Form Fills" figure) shared
 * by the website pricing grid and the app's plan picker.
 *
 * The numbers here are the **authoritative, deliberately-conservative** figures
 * from the backend concept doc `services/.../billing-and-subscriptions.md`. Live
 * usage (tokensUsed / tokenLimit) always comes from `GET /entitlements`, never
 * from here — `tokenLimit` below is only the default cap for display.
 */
export interface PlanFeatureBullet {
  text: string
  /** Rendered de-emphasised (e.g. a limitation rather than a benefit). */
  muted?: boolean
}

export interface PlanCatalogEntry {
  key: PlanKey
  /** Human label, e.g. "Pro Tester". */
  displayName: string
  /** Price in USD cents (0 | 1200 | 2900 | 9900) — for sorting/formatting. */
  priceUsdCents: number
  /** Display price, e.g. "$29". */
  priceLabel: string
  /** Billing cadence suffix, e.g. "/ mo" or "/ forever". */
  pricePer: string
  /** Default monthly AI token cap (0 = unlimited). Live value comes from the API. */
  tokenLimit: number
  /** Friendly "≈ Form Fills" marketing figure, e.g. "~6,000". */
  marketingFills: string
  /** One-line target-audience tagline. */
  tagline: string
  featureBullets: PlanFeatureBullet[]
  /** The highlighted "Most popular" tier. */
  recommended?: boolean
  /** Whether this plan can be purchased via self-serve Stripe Checkout. */
  selfServe: boolean
}

/** Ordered free → starter → pro → enterprise. */
export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    key: 'free',
    displayName: 'Free',
    priceUsdCents: 0,
    priceLabel: '$0',
    pricePer: '/ forever',
    tokenLimit: 2500,
    marketingFills: '~10',
    tagline: 'Evaluation & first-time users',
    selfServe: false,
    featureBullets: [
      { text: 'Unlimited manual scan & fill' },
      { text: 'Saved profiles & records' },
      { text: 'Generators & undo' },
      { text: 'Limited AI classification', muted: true },
    ],
  },
  {
    key: 'starter',
    displayName: 'Starter',
    priceUsdCents: 1200,
    priceLabel: '$12',
    pricePer: '/ mo',
    tokenLimit: 500_000,
    marketingFills: '~1,500',
    tagline: 'Solo developers & freelance QA',
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Free' },
      { text: '500K AI tokens / month' },
      { text: 'Priority field classification' },
      { text: 'Email support' },
    ],
  },
  {
    key: 'pro',
    displayName: 'Pro Tester',
    priceUsdCents: 2900,
    priceLabel: '$29',
    pricePer: '/ mo',
    tokenLimit: 2_000_000,
    marketingFills: '~6,000',
    tagline: 'Full-time manual QA professionals',
    recommended: true,
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Starter' },
      { text: '2M AI tokens / month' },
      { text: 'Seedable generators for QA' },
      { text: 'Profile sync across devices' },
    ],
  },
  {
    key: 'enterprise',
    displayName: 'Enterprise',
    priceUsdCents: 9900,
    priceLabel: '$99+',
    pricePer: '/ mo',
    tokenLimit: 8_000_000,
    marketingFills: '~20,000+',
    tagline: 'QA agencies & testing teams',
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Pro Tester' },
      { text: '8M+ AI tokens / month' },
      { text: 'SSO & team management' },
      { text: 'Dedicated support & SLA' },
    ],
  },
]

/** Look up a catalogue entry by plan key (throws on an unknown key). */
export function planByKey(key: PlanKey): PlanCatalogEntry {
  const entry = PLAN_CATALOG.find((plan) => plan.key === key)
  if (!entry) throw new Error(`Unknown plan key: ${key}`)
  return entry
}
