/**
 * Pure AI-usage helpers shared by every surface. No I/O, no framework.
 *
 * The backend meters raw AI tokens; the product speaks "Form Fills". One
 * standard form ≈ {@link TOKENS_PER_FILL} tokens. These helpers convert between
 * the two and answer the gating questions (over / near quota, unlimited).
 *
 * Convention: a `tokenLimit` of `0` means the tier is **uncapped** (unlimited
 * AI). Always branch on {@link isUnlimited} before showing a "fills left" / "%
 * used" figure — the finite helpers return `0` for unlimited plans by design.
 */

/** Tokens consumed by one "standard" form fill (≈200 input + ~50 output). */
export const TOKENS_PER_FILL = 250

/** A `tokenLimit` of 0 means the plan has no AI cap. */
export function isUnlimited(tokenLimit: number): boolean {
  return tokenLimit <= 0
}

/** Friendly "form fills" equivalent of a raw token count (rounded up). */
export function tokensToFills(tokens: number): number {
  if (tokens <= 0) return 0
  return Math.ceil(tokens / TOKENS_PER_FILL)
}

/** Percent of the monthly token budget consumed, clamped 0–100. Unlimited → 0. */
export function usagePercent(tokensUsed: number, tokenLimit: number): number {
  if (isUnlimited(tokenLimit)) return 0
  return Math.min(100, Math.round((tokensUsed / tokenLimit) * 100))
}

/**
 * Whole form fills still available this cycle. Returns `0` for unlimited plans
 * (callers should check {@link isUnlimited} first) and never goes negative.
 */
export function fillsRemaining(tokensUsed: number, tokenLimit: number): number {
  if (isUnlimited(tokenLimit)) return 0
  const remainingTokens = Math.max(0, tokenLimit - tokensUsed)
  return Math.floor(remainingTokens / TOKENS_PER_FILL)
}

/** True once the monthly AI budget is exhausted. Unlimited plans never run out. */
export function isOverQuota(tokensUsed: number, tokenLimit: number): boolean {
  if (isUnlimited(tokenLimit)) return false
  return tokensUsed >= tokenLimit
}

/**
 * True when usage is at/above `threshold` (default 90%) of the budget — used to
 * tint the usage chip amber before the hard stop. Unlimited plans are never near.
 */
export function isNearQuota(tokensUsed: number, tokenLimit: number, threshold = 0.9): boolean {
  if (isUnlimited(tokenLimit)) return false
  return tokensUsed / tokenLimit >= threshold
}

/**
 * Precise raw-token usage label, locale-grouped — e.g. `"12,340 / 500,000"`, or
 * `"12,340 tokens"` for unlimited plans (no denominator).
 */
export function formatTokenUsage(tokensUsed: number, tokenLimit: number): string {
  const used = tokensUsed.toLocaleString('en-US')
  if (isUnlimited(tokenLimit)) return `${used} tokens`
  return `${used} / ${tokenLimit.toLocaleString('en-US')}`
}
