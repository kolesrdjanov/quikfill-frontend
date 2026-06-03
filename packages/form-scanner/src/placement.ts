/**
 * Placement + eligibility helpers for an in-page action UI anchored to scanned
 * forms (the CE's floating "Fill" button). Pure — no chrome.*, no Vue, no layout
 * reads — so they unit-test directly: the field-count floor that decides whether a
 * grouped form is worth offering a fill, and the hit-test that decides whether a
 * form's anchor is currently covered by another element (a drawer/modal), so the
 * consumer can hide its action instead of bleeding through on top of the overlay.
 */

/** Minimum fillable fields (native inputs + driveable custom selects) a grouped form
 * needs before it earns an action. Floors out button-only (0) and single-input
 * search boxes (1). Set to 2 so multi-step / accordion forms whose first visible
 * step exposes only two inputs still earn a button (the tradeoff: 2-input forms
 * such as email+password logins now qualify too). */
export const MIN_FILLABLE_FIELDS = 2

/** True when a form has enough fillable fields to be worth offering a fill. */
export function qualifiesForFill(fillableFieldCount: number): boolean {
  return fillableFieldCount >= MIN_FILLABLE_FIELDS
}

/**
 * Decide whether `hit` — the element at the anchor's centre (`elementFromPoint`) —
 * means the anchor is OCCLUDED by something else. `ignoreRoot` is a subtree (the
 * consumer's own overlay host) whose elements never count as occluders, so the
 * action never hides itself.
 *
 * Occluded when nothing was hit (anchor scrolled off-screen) or the hit is a foreign
 * element. NOT occluded when the hit is the anchor, inside the anchor, an ancestor of
 * the anchor, or inside `ignoreRoot`.
 */
export function isOccludingHit(anchor: Element, ignoreRoot: Element, hit: Element | null): boolean {
  if (hit === null) return true
  if (ignoreRoot.contains(hit)) return false
  if (anchor.contains(hit) || hit.contains(anchor)) return false
  return true
}
