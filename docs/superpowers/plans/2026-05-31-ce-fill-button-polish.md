# CE Floating "Fill" Button Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CE in-page "Fill" button look right (brand-tile idle, refined hover pill), stop it bleeding through drawers/modals, and only decorate forms with 3+ fillable fields.

**Architecture:** Two pure, tested helpers move into `@quikfill/form-scanner` (already DOM-aware, Chrome/Vue-free, Vitest+jsdom set up): `qualifiesForFill(count)` and `isOccludingHit(anchor, ignoreRoot, hit)`. The single overlay file `apps/chrome-extension/entrypoints/content/overlay.ts` consumes them in `scan()`/`reposition()` and gets a rewritten `OVERLAY_CSS` + a de-nested brand glyph. Nothing else changes (no backend, schemas, fill engine, or auth/settings).

**Tech Stack:** TypeScript, WXT (MV3) content script, Shadow DOM + inline CSS string, Vitest 3 + jsdom (in `@quikfill/form-scanner`), pnpm workspaces.

> **Note vs spec:** the spec named the test home as a CE-app `overlay.test.ts`. The CE app has **no Vitest runner** (`pnpm test` = `pnpm -r test`, and the CE package has no `test` script), so the two pure helpers live + are tested in `@quikfill/form-scanner` instead. The spec's helper `qualifiesForButton` is renamed `qualifiesForFill` (UI-neutral name for the engine package). Same behaviour, same coverage.

---

## File Structure

| File                                                   | Responsibility                                                                                                 | Change     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/form-scanner/src/placement.ts`               | Pure helpers: the fillable-field floor + the occlusion hit-test decision. No DOM layout, no chrome.\*, no Vue. | **Create** |
| `packages/form-scanner/src/placement.test.ts`          | Vitest unit tests for both helpers (jsdom DOM nodes).                                                          | **Create** |
| `packages/form-scanner/src/index.ts`                   | Package barrel — export the new helpers.                                                                       | Modify     |
| `apps/chrome-extension/entrypoints/content/overlay.ts` | Inject/position the Fill button; the only file with the CSS, glyph, qualification, and occlusion wiring.       | Modify     |

---

## Task 1: Pure placement helpers in `@quikfill/form-scanner` (TDD)

**Files:**

- Create: `packages/form-scanner/src/placement.ts`
- Test: `packages/form-scanner/src/placement.test.ts`
- Modify: `packages/form-scanner/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/form-scanner/src/placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isOccludingHit, MIN_FILLABLE_FIELDS, qualifiesForFill } from './placement'

describe('qualifiesForFill', () => {
  it('rejects forms with fewer than 3 fillable fields', () => {
    expect(qualifiesForFill(0)).toBe(false)
    expect(qualifiesForFill(1)).toBe(false)
    expect(qualifiesForFill(2)).toBe(false)
  })

  it('accepts forms with 3 or more fillable fields', () => {
    expect(qualifiesForFill(3)).toBe(true)
    expect(qualifiesForFill(4)).toBe(true)
    expect(qualifiesForFill(MIN_FILLABLE_FIELDS)).toBe(true)
  })
})

describe('isOccludingHit', () => {
  // anchor lives inside `root`; `host` is our overlay subtree; `drawer` is a foreign
  // element that could cover the anchor. `contains` works on detached trees, so no
  // need to attach to document.
  function fixture() {
    const root = document.createElement('div')
    const host = document.createElement('div')
    const hostChild = document.createElement('i')
    host.appendChild(hostChild)
    const anchor = document.createElement('button')
    const anchorChild = document.createElement('span')
    anchor.appendChild(anchorChild)
    const drawer = document.createElement('div')
    root.append(host, anchor, drawer)
    return { root, host, hostChild, anchor, anchorChild, drawer }
  }

  it('not occluded when the hit IS the anchor', () => {
    const { anchor, host } = fixture()
    expect(isOccludingHit(anchor, host, anchor)).toBe(false)
  })

  it('not occluded when the hit is inside the anchor', () => {
    const { anchor, anchorChild, host } = fixture()
    expect(isOccludingHit(anchor, host, anchorChild)).toBe(false)
  })

  it('not occluded when the hit is an ancestor of the anchor', () => {
    const { anchor, root, host } = fixture()
    expect(isOccludingHit(anchor, host, root)).toBe(false)
  })

  it('not occluded when the hit is inside the ignored host', () => {
    const { anchor, host, hostChild } = fixture()
    expect(isOccludingHit(anchor, host, hostChild)).toBe(false)
  })

  it('occluded when a foreign element covers the anchor', () => {
    const { anchor, host, drawer } = fixture()
    expect(isOccludingHit(anchor, host, drawer)).toBe(true)
  })

  it('occluded when nothing is hit (anchor off-screen)', () => {
    const { anchor, host } = fixture()
    expect(isOccludingHit(anchor, host, null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @quikfill/form-scanner exec vitest run src/placement.test.ts`
Expected: FAIL — `Failed to resolve import "./placement"` (module doesn't exist yet).

- [ ] **Step 3: Create the implementation**

Create `packages/form-scanner/src/placement.ts`:

```ts
/**
 * Placement + eligibility helpers for an in-page action UI anchored to scanned
 * forms (the CE's floating "Fill" button). Pure — no chrome.*, no Vue, no layout
 * reads — so they unit-test directly: the field-count floor that decides whether a
 * grouped form is worth offering a fill, and the hit-test that decides whether a
 * form's anchor is currently covered by another element (a drawer/modal), so the
 * consumer can hide its action instead of bleeding through on top of the overlay.
 */

/** Minimum fillable fields (native inputs + driveable custom selects) a grouped form
 * needs before it earns an action. Floors out button-only (0), single-input search
 * boxes (1), and 2-input forms incl. email+password logins. */
export const MIN_FILLABLE_FIELDS = 3

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
```

- [ ] **Step 4: Export from the package barrel**

In `packages/form-scanner/src/index.ts`, add after the existing `export { ... } from './extract'` block:

```ts
export { MIN_FILLABLE_FIELDS, qualifiesForFill, isOccludingHit } from './placement'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @quikfill/form-scanner exec vitest run src/placement.test.ts`
Expected: PASS — 2 suites, 8 tests green.

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @quikfill/form-scanner typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/form-scanner/src/placement.ts packages/form-scanner/src/placement.test.ts packages/form-scanner/src/index.ts
git commit -m "feat(form-scanner): add fill eligibility + occlusion placement helpers"
```

---

## Task 2: Qualification — require 3+ fillable fields (overlay `scan()`)

**Files:**

- Modify: `apps/chrome-extension/entrypoints/content/overlay.ts`

- [ ] **Step 1: Import the helper**

Replace the form-scanner import (currently `import { applyFill, scanFormsGrouped } from '@quikfill/form-scanner'`) with:

```ts
import {
  applyFill,
  isOccludingHit,
  qualifiesForFill,
  scanFormsGrouped,
} from '@quikfill/form-scanner'
```

(`isOccludingHit` is used in Task 3; importing both now keeps one import edit.)

- [ ] **Step 2: Replace the qualification + anchor block in `scan()`**

Find this block:

```ts
// Fillable fields = native inputs + detected custom selects; skip forms with
// none (a button that could fill nothing).
const nativeIds = form.fieldIds.filter((id) => {
  const f = fieldById.get(id)
  return f ? isFillableField(f) : false
})
if (nativeIds.length === 0) continue

// Anchor preference: the submit button (where the user looks), else the last
// field, else the group root. A clear submit OR a substantial form (2+ native
// fields) earns a button; a lone field with no submit is left alone to avoid
// decorating stray inputs (search boxes etc.). This is the §10.1 resolution:
// anchor to the last field rather than skip when no submit is detected.
const submitEl = resolveSubmit(form, groupRoot, doc)
if (!submitEl && nativeIds.length < 2) continue
const anchor = submitEl ?? resolveFieldEl(nativeIds[nativeIds.length - 1], doc) ?? groupRoot
```

Replace it with:

```ts
// Fillable fields = native inputs + detected custom selects. A form must clear
// the MIN_FILLABLE_FIELDS floor (qualifiesForFill) to earn a button: this skips
// button-only forms (0), single-input search boxes (1), and 2-input forms
// (incl. email+password logins) so we only decorate substantial forms.
const fillableIds = form.fieldIds.filter((id) => {
  const f = fieldById.get(id)
  return f ? isFillableField(f) : false
})
if (!qualifiesForFill(fillableIds.length)) continue

// The submit button only POSITIONS the button — it no longer gates whether a
// form qualifies. Anchor to the submit, else the last fillable field, else the
// group root.
const submitEl = resolveSubmit(form, groupRoot, doc)
const anchor = submitEl ?? resolveFieldEl(fillableIds[fillableIds.length - 1], doc) ?? groupRoot
```

- [ ] **Step 3: Typecheck the extension**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: no errors. (Confirms `qualifiesForFill` resolves and `nativeIds` has no stray references.)

- [ ] **Step 4: Commit**

```bash
git add apps/chrome-extension/entrypoints/content/overlay.ts
git commit -m "feat(ce): require 3+ fillable fields before showing a Fill button"
```

---

## Task 3: Occlusion guard — hide buttons covered by a drawer/modal (overlay `reposition()`)

**Files:**

- Modify: `apps/chrome-extension/entrypoints/content/overlay.ts`

- [ ] **Step 1: Add the hit-test in `reposition()`**

Find this block:

```ts
const rect = anchor.getBoundingClientRect()
// Hidden / zero-box anchor (e.g. inside a closed tab) → hide the button.
if (rect.width === 0 && rect.height === 0) {
  button.el.style.display = 'none'
  continue
}
button.el.style.display = ''
```

Replace it with:

```ts
const rect = anchor.getBoundingClientRect()
// Hidden / zero-box anchor (e.g. inside a closed tab) → hide the button.
if (rect.width === 0 && rect.height === 0) {
  button.el.style.display = 'none'
  continue
}
// Occlusion guard: a drawer/modal/sticky element now covering the anchor makes
// a hit-test at its centre return that element (or null when scrolled off).
// Hide the button so it can't float on top of an overlay that sits above the
// form. Our own host is ignored, so the button never hides itself. When the
// drawer closes, the resulting DOM mutation re-scans → reposition → it returns.
const cx = rect.left + rect.width / 2
const cy = rect.top + rect.height / 2
if (isOccludingHit(anchor, host, doc.elementFromPoint(cx, cy))) {
  button.el.style.display = 'none'
  continue
}
button.el.style.display = ''
```

(`host` and `doc` are both in scope inside `mountOverlay`.)

- [ ] **Step 2: Typecheck the extension**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/entrypoints/content/overlay.ts
git commit -m "fix(ce): hide Fill buttons whose anchor is covered by a drawer/modal"
```

---

## Task 4: Visual redesign — de-nested glyph + new `OVERLAY_CSS`

**Files:**

- Modify: `apps/chrome-extension/entrypoints/content/overlay.ts`

- [ ] **Step 1: Replace the brand SVG with a de-nested glyph**

Find the `QUIKFILL_ICON_SVG` constant (the block with `<defs>`, `<linearGradient id="qfTile">`, `<rect ... fill="url(#qfTile)">`, the bolt `<path>`, and the `<circle>`) and its doc comment. Replace the whole constant + comment with:

```ts
/**
 * The QuikFill glyph — the lightning bolt + green "spark" dot, WITHOUT the brand
 * tile's background rect/gradient. The button's own gradient surface IS the tile, so
 * the glyph sits straight on it (no nested square, no clipped seam). White bolt on
 * the blue surface; the dot keeps the brand green. Decorative — the button itself
 * carries the aria-label.
 */
const QUIKFILL_GLYPH_SVG = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M25.25 11.5 12.75 26.5H24l-1.25 10 12.5-15H24l1.25-9.5Z" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="35.4" cy="12.6" r="3.4" fill="#13C296"/>
</svg>`
```

- [ ] **Step 2: Point `createButton` at the renamed constant**

In `createButton`, change:

```ts
mark.innerHTML = QUIKFILL_ICON_SVG
```

to:

```ts
mark.innerHTML = QUIKFILL_GLYPH_SVG
```

- [ ] **Step 3: Replace `OVERLAY_CSS` wholesale**

Replace the entire `const OVERLAY_CSS = \`...\`` block with:

```ts
const OVERLAY_CSS = `
:host { all: initial; }
.qf-fill-btn {
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: linear-gradient(135deg, #3f66e0, #2544c0);
  color: #ffffff;
  font: 600 12.5px/1 system-ui, -apple-system, Segoe UI, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(37, 68, 192, 0.32);
  overflow: hidden;
  white-space: nowrap;
  transition:
    width 0.18s ease,
    border-radius 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background 0.15s ease;
}
.qf-fill-btn:hover,
.qf-fill-btn.is-loading,
.qf-fill-btn.is-success,
.qf-fill-btn.is-error {
  width: auto;
  padding: 0 12px 0 8px;
  border-radius: 9999px;
}
.qf-fill-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 68, 192, 0.42);
}
.qf-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
.qf-mark svg { width: 18px; height: 18px; display: block; }
.qf-label {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-width 0.18s ease,
    margin-left 0.18s ease,
    opacity 0.15s ease;
}
.qf-fill-btn:hover .qf-label,
.qf-fill-btn.is-loading .qf-label,
.qf-fill-btn.is-success .qf-label,
.qf-fill-btn.is-error .qf-label {
  max-width: 130px;
  margin-left: 6px;
  opacity: 1;
}
.qf-fill-btn.is-success { background: #13c296; box-shadow: 0 4px 12px rgba(19, 194, 150, 0.4); }
.qf-fill-btn.is-error { background: #e11d48; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.4); }
.qf-fill-btn.is-loading { opacity: 0.9; cursor: default; transform: none; }
`
```

Key behaviours encoded: idle is a 30×30 squircle (radius 9px) with the 18px glyph centred (`justify-content: center`, label collapsed to `max-width/margin-left: 0` so it doesn't pull the glyph off-centre — fixing the old 34px seam); hover/state classes grow `width: auto` + full-round radius and reveal the label via `max-width`/`margin-left`/`opacity`; hover adds a `translateY(-1px)` lift + deeper shadow; success/error/loading keep their colours and the loading state suppresses the lift.

- [ ] **Step 4: Build the extension**

Run: `pnpm --filter @quikfill/chrome-extension build`
Expected: `✔ Built extension` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/entrypoints/content/overlay.ts
git commit -m "style(ce): brand-tile idle button + refined hover pill with lift"
```

---

## Task 5: Full quality gate, manual verification, push

**Files:** none (verification + integration)

- [ ] **Step 1: Run the full quality gate from the repo root**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: all green. If `format:check` flags the touched files, run `pnpm format` and amend the relevant commit.

- [ ] **Step 2: Manual verification (`pnpm dev:ext`, load unpacked in Chrome/Edge/Brave, visit a multi-form page e.g. the QuikStor facilities screen)**

Confirm:

- Idle button is a clean squircle tile showing the bolt + green dot — **no right-edge seam**, glyph centred.
- Hover → it grows into a pill, lifts slightly, and reveals "Fill" smoothly.
- Open the **Create New Facility** drawer → Fill buttons on the underlying list forms **disappear**; the drawer's own form keeps its button, anchored near **Add Facility**, on top of the drawer.
- Close the drawer → the underlying buttons **reappear**.
- The list's single search input, any 2-input form, and the button-only **Filter & Sort** menu show **no** button; the multi-field facility form shows one.
- A fill still runs: loading "Filling…", success "Filled" (green), and an error state (e.g. over quota → "AI limit reached", rose) all render on the new surface.

- [ ] **Step 3: Flip the spec status to implemented**

In `docs/superpowers/specs/2026-05-31-ce-fill-button-polish-design.md`, change the status line `> Status: **Designed, approved, not started.**` to `> Status: **Implemented.**`.

```bash
git add docs/superpowers/specs/2026-05-31-ce-fill-button-polish-design.md
git commit -m "docs(ce): mark Fill button polish spec implemented"
```

- [ ] **Step 4: Land on main**

```bash
git fetch origin && git rebase origin/main && git push origin main
```

Expected: clean push (rebase first per the repo's concurrent-commit workflow; stage only the files listed above).

---

## Self-Review

**Spec coverage:**

- §2 idle brand-tile / seam fix → Task 4 (glyph de-nest + CSS idle squircle).
- §3 refined hover pill + lift + state restyle → Task 4 (CSS hover/state rules).
- §4 occlusion fix → Task 1 (`isOccludingHit` + tests) + Task 3 (wiring in `reposition()`).
- §5 3+ fillable-field floor → Task 1 (`qualifiesForFill` + tests) + Task 2 (wiring in `scan()`, submit no longer gates).
- §6 testing → Task 1 unit tests; Task 5 manual checklist + full gate.
- §7 scope → only `form-scanner/placement.*`, its barrel, and `overlay.ts` are touched; no backend/schemas/fill-engine/auth changes.

**Placeholder scan:** none — every code/CSS step shows full content; every run step has an exact command + expected result.

**Type consistency:** helper names `qualifiesForFill`, `isOccludingHit`, `MIN_FILLABLE_FIELDS` are identical across `placement.ts`, the test, the barrel export, and both `overlay.ts` call sites. `QUIKFILL_GLYPH_SVG` is defined in Task 4 Step 1 and referenced in Step 2. `fillableIds`/`host`/`doc` all exist in the shown scope.
