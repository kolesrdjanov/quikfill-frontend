/**
 * Pure AI-usage helpers shared by every surface. No I/O, no framework.
 *
 * Usage is metered in **form fills**: one AI form fill (a single `/ai/fill` call)
 * counts as one unit, regardless of form size. The live counts come from
 * `GET /entitlements` (`fillsUsed` / `fillLimit`); these helpers answer the gating
 * questions (over / near quota, unlimited, remaining).
 *
 * Convention: a `fillLimit` of `0` means the tier is **uncapped** (unlimited AI).
 * Always branch on {@link isUnlimited} before showing a "fills left" / "% used"
 * figure — the finite helpers return `0` for unlimited plans by design.
 */

/** A `fillLimit` of 0 means the plan has no AI cap. */
export function isUnlimited(fillLimit: number): boolean {
  return fillLimit <= 0
}

/** Percent of the monthly fill budget consumed, clamped 0–100. Unlimited → 0. */
export function usagePercent(fillsUsed: number, fillLimit: number): number {
  if (isUnlimited(fillLimit)) return 0
  return Math.min(100, Math.round((fillsUsed / fillLimit) * 100))
}

/**
 * Form fills still available this cycle. Returns `0` for unlimited plans (callers
 * should check {@link isUnlimited} first) and never goes negative.
 */
export function fillsRemaining(fillsUsed: number, fillLimit: number): number {
  if (isUnlimited(fillLimit)) return 0
  return Math.max(0, fillLimit - fillsUsed)
}

/** True once the monthly fill budget is exhausted. Unlimited plans never run out. */
export function isOverQuota(fillsUsed: number, fillLimit: number): boolean {
  if (isUnlimited(fillLimit)) return false
  return fillsUsed >= fillLimit
}

/**
 * True when usage is at/above `threshold` (default 90%) of the budget — used to
 * tint the usage chip amber before the hard stop. Unlimited plans are never near.
 */
export function isNearQuota(fillsUsed: number, fillLimit: number, threshold = 0.9): boolean {
  if (isUnlimited(fillLimit)) return false
  return fillsUsed / fillLimit >= threshold
}

/**
 * Precise fill-usage label, locale-grouped — e.g. `"47 / 200"`, or `"47 fills"`
 * for unlimited plans (no denominator).
 */
export function formatFillUsage(fillsUsed: number, fillLimit: number): string {
  const used = fillsUsed.toLocaleString('en-US')
  if (isUnlimited(fillLimit)) return `${used} fills`
  return `${used} / ${fillLimit.toLocaleString('en-US')}`
}
