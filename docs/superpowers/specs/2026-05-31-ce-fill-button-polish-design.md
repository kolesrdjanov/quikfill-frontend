# Chrome Extension — Floating "Fill" Button Polish & Qualification

> Status: **Implemented.** Design doc for the CE in-page floating-button visual +
> behaviour pass. Built in `@quikfill/form-scanner` (`placement.ts`) +
> `overlay.ts`; plan at `docs/superpowers/plans/2026-05-31-ce-fill-button-polish.md`.
> Date: 2026-05-31.

---

## 1. Context

The CE injects an in-page floating **"Fill"** button near each detected form's
submit control (the post-revamp flow — see `CHROME_EXTENSION_REVAMP_PLAN.md`). All
of this UI lives in one file:
`apps/chrome-extension/entrypoints/content/overlay.ts` — an isolated Shadow-DOM
host appended to `<html>`, with the button styled by the inline `OVERLAY_CSS`
string and the brand mark inlined as `QUIKFILL_ICON_SVG`.

Three problems were reported from the QuikStor facilities screen:

1. **Idle button looks wrong.** The collapsed button is a _nested_ shape — a blue
   circular pill (`max-width: 34px`, `height: 28px`) containing the brand **tile**
   (`QUIKFILL_ICON_SVG`, itself a gradient rounded-square) containing the lightning
   glyph. It reads as "a logo inside a circle," and because the pill is 34px wide
   but 28px tall with `overflow: hidden` clipping the start of the still-in-flow
   "Fill" label (+ its 6px gap), the right edge shows a visible **seam / cutoff**.

2. **Buttons bleed through modals/drawers.** The button is `position: fixed` at
   `z-index: 2147483646`. A Fill button anchored to a form that sits _underneath_
   an open drawer/modal still floats on top of it, so a stray button appears to be
   "inside" the drawer.

3. **Trivial forms get decorated.** Single-input search boxes, 2-field forms, and
   button-only toolbars currently qualify (rule today: "a clear submit OR 2+
   fillable fields"). The user wants a hard floor that skips these.

The hover/expanded state is functional but "basic" and should be made more
polished.

### Decisions captured during brainstorming

- **Idle button = the brand tile itself** (a squircle), not a tile-inside-a-circle.
- **Hover = refined & branded:** one continuous gradient surface morphs into a pill
  with a subtle lift; no nested tile.
- **Occlusion-only suppression** (precise) — hide a button only when its anchor is
  actually covered. No "modal-exclusive" mode.
- **Hard floor = 3+ fillable fields.** Skips button-only (0), single-input (1), and
  2-input (2) forms — including typical email+password logins, which is intended
  given QuikFill targets long/tedious forms.

### Architecture note (why it stays in the overlay)

`@quikfill/form-scanner` stays a pure DOM engine that returns _all_ forms; the
overlay decides _which_ to decorate. So the qualification floor and the occlusion
test live in `overlay.ts`, consistent with the current split. `isFillableField`
(native input **or** a custom select carrying a `customWidget` descriptor) comes
from `@quikfill/ai` and is unchanged.

---

## 2. Idle button — brand tile _is_ the button

The button's **own surface** carries the brand gradient and shape; we stop nesting
a self-contained tile inside it.

- Surface: `linear-gradient(135deg, #3F66E0, #2544C0)`, **squircle** ~30×30px,
  `border-radius: 9px` (echoes the tile's `rx 13 / 48` corner ratio). Size is
  tunable.
- Glyph: render **only the lightning path + green accent dot** (`#13C296`) directly
  on the surface — i.e. drop the wrapping `<rect ... fill="url(#qfTile)">` from the
  inlined SVG so there's no second background. White lightning, ~16–18px, centered.
- Collapsed shape is exactly the square with the label fully hidden (not a clipped
  pill), so **the right-edge seam disappears**.
- Keep `aria-label="Fill this form with QuikFill"` on the button; the glyph stays
  `aria-hidden`.

## 3. Hover / expanded — refined & branded

The **same single surface** animates on hover (and while loading/success/error):

- Squircle → **pill**: width grows to fit the "Fill" label; `border-radius` eases to
  `9999px`; the label slides/fades in beside the glyph.
- **Lift:** deeper shadow + `translateY(-1px)` on hover.
- Transition ~180ms ease on `width`/`max-width`, `border-radius`, `box-shadow`,
  `transform`. One continuous gradient surface throughout — no nested tile, no
  overflow seam.
- **States unchanged in meaning, restyled to ride the new surface:** `is-loading`
  → "Filling…" (dimmed, no lift jitter), `is-success` → "Filled" on green
  (`#13C296`), `is-error` → mapped `ERROR_COPY` label on rose (`#E11D48`) with the
  existing `title` tooltip + 5s/2.5s auto-return timers. The error-cause mapping
  (`ERROR_COPY`) and the entitlement/over-quota gating are untouched.

## 4. Occlusion fix (bleed-through)

In `reposition()`, after computing the anchor's `getBoundingClientRect()`:

- Compute the anchor center `(cx, cy)` in viewport coords (matches the button's
  `position: fixed`).
- Hit-test with `doc.elementFromPoint(cx, cy)` and **hide** the button when:
  - the result is `null` (anchor scrolled out of the viewport), **or**
  - the topmost element is **neither the anchor nor in its ancestor/descendant
    chain** — i.e. a drawer / modal / sticky header covers the anchor.
- **Ignore our own overlay host** in that test (an element inside `host` never
  counts as an occluder), so the button never hides itself.
- The existing zero-box hide stays as a cheap pre-check.
- **Recovery:** closing a drawer mutates the DOM → the debounced observer re-scans
  → `reposition()` runs → the previously-occluded button reappears. No new timers.

Extract the decision as a pure helper for testing:
`isAnchorOccluded(anchor, host, elementFromPoint): boolean` — takes an injectable
`elementFromPoint` so it can be unit-tested without layout.

## 5. Qualification — 3+ fillable fields (hard floor)

- Add `const MIN_FILLABLE_FIELDS = 3`.
- In `scan()`, compute `fillableIds = form.fieldIds.filter(id → isFillableField(…))`
  (already done as `nativeIds`), then gate with a **single** rule:
  `if (fillableIds.length < MIN_FILLABLE_FIELDS) continue`.
- This **replaces** both current checks: the `nativeIds.length === 0` skip and the
  `!submitEl && nativeIds.length < 2` skip. The submit button **no longer gates
  qualification** — it is used **only** for anchoring
  (`submitEl ?? lastField ?? groupRoot`).
- Update the stale comment block that references "2+ native fields / §10.1".

Extract the decision as a pure helper: `qualifiesForButton(fillableCount): boolean`
(`fillableCount >= MIN_FILLABLE_FIELDS`).

Net effect: button-only (0), single-input (1), and 2-input (2) forms get **no**
button; forms with **3+ fillable fields** (native inputs + driveable custom
selects) get one, anchored at the submit button when present.

---

## 6. Testing

jsdom has no layout (no real `getBoundingClientRect`/`elementFromPoint`), which is
why the overlay has no tests today. We make the _decisions_ testable by extracting
pure helpers, and verify the _visual/live_ behaviour manually (the repo's unit +
manual rule for the CE).

### Unit (new `entrypoints/content/overlay.test.ts`, Vitest)

- `qualifiesForButton`: 0/1/2 → `false`; 3, 4 → `true`.
- `isAnchorOccluded` with a stubbed `elementFromPoint`:
  - returns the anchor → not occluded.
  - returns a descendant of the anchor → not occluded.
  - returns a foreign element (drawer node) → occluded.
  - returns `null` → occluded.
  - returns a node inside the overlay host → ignored (not occluded).

### Manual (`pnpm dev:ext`, QuikStor facilities screen)

- Idle button is a clean squircle tile — **no right-edge seam**.
- Hover → pill expands with the lift; "Fill" reveals smoothly.
- Open **Create New Facility** drawer → buttons on the underlying list forms
  **hide**; the drawer's own form button shows, anchored at **Add Facility**.
- Close the drawer → the underlying buttons **reappear**.
- The list's single search input, any 2-input form, and the button-only
  **Filter & Sort** menu get **no** button; the multi-field facility form does.
- loading/success/error states still render with the new surface.

### Quality gate

`pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test` green.

---

## 7. Scope

**In:** `apps/chrome-extension/entrypoints/content/overlay.ts` — `OVERLAY_CSS`,
the glyph markup, the `scan()` qualification gate, the `reposition()` occlusion
test, and the two extracted pure helpers — plus a new `overlay.test.ts`.

**Out:** backend, `@quikfill/schemas`, `@quikfill/form-scanner`, `@quikfill/ai`,
the fill engine (`applyFill`), the entitlement/over-quota gating, the auth/settings
surfaces, and any "modal-exclusive" suppression mode.

## 8. Critical files

| Area               | File                                                        |
| ------------------ | ----------------------------------------------------------- |
| Overlay UI + logic | `apps/chrome-extension/entrypoints/content/overlay.ts`      |
| New unit tests     | `apps/chrome-extension/entrypoints/content/overlay.test.ts` |
| Reused (unchanged) | `packages/ai/src/fill-request.ts` (`isFillableField`)       |
