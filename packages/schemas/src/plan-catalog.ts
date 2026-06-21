import type { PlanKey } from './subscription'

/**
 * The static plan catalogue — the single source of truth for *marketing* plan
 * metadata (prices, feature bullets, the form-fill figure) shared by the website
 * pricing grid and the app's plan picker.
 *
 * Live usage (fillsUsed / fillLimit) always comes from `GET /entitlements`, never
 * from here — `fillLimit` below is only the default cap for display.
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
  /** Default monthly AI form-fill cap (0 = unlimited). Live value comes from the API. */
  fillLimit: number
  /** The "AI form fills / mo" marketing figure, e.g. "1,000". */
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
    fillLimit: 10,
    marketingFills: '10',
    tagline: 'Evaluation & first-time users',
    selfServe: false,
    featureBullets: [
      { text: 'Unlimited manual scan & fill' },
      { text: 'Saved profiles & records' },
      { text: 'Generators & undo' },
      { text: 'Limited AI fills', muted: true },
    ],
  },
  {
    key: 'starter',
    displayName: 'Starter',
    priceUsdCents: 1200,
    priceLabel: '$12',
    pricePer: '/ mo',
    fillLimit: 200,
    marketingFills: '200',
    tagline: 'Solo developers & freelance QA',
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Free' },
      { text: '200 AI form fills / month' },
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
    fillLimit: 1000,
    marketingFills: '1,000',
    tagline: 'Full-time manual QA professionals',
    recommended: true,
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Starter' },
      { text: '1,000 AI form fills / month' },
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
    fillLimit: 10000,
    marketingFills: '10,000',
    tagline: 'QA agencies & testing teams',
    selfServe: true,
    featureBullets: [
      { text: 'Everything in Pro Tester' },
      { text: '10,000 AI form fills / month' },
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
