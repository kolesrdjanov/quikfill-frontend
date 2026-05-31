# Custom-select fill overhaul — Playwright-style option locator + the two real bugs

**Date:** 2026-05-31
**Status:** Approved (design) → next: implementation plan
**Scope:** `packages/form-scanner` (+ a `CustomWidget` field in `packages/schemas`)
**Owner:** fill engine

## Why

Filling **custom dropdowns inside drawers/modals** has failed repeatedly. Two
user-reported symptoms:

1. **"It prefilled the dropdown with the first value."**
2. **"It emits events that make the drawer/modal close (as if clicking outside)."**

Every prior attempt was coded **blind against the closed dropdown** — the option
list does not exist in the DOM until the widget is opened. This time we captured
the **real failing page in both states**:

- `~/Desktop/full.html` — facility-creation drawer, country select **closed**.
- `~/Desktop/full-open.html` — same page, country select **open** (248 options).

These two captures are the ground truth this design is built and tested against.

## What the captures prove

The failing widget is the **Country** select in the "Add Facility" drawer:

```html
<!-- widget root (QuikFill tags it qf-9) -->
<div name="address.country" data-test-id="address-country" data-qf-id="qf-9">
  <div class="relative">
    <!-- trigger -->
    <div role="button" data-trigger="select" aria-expanded="true">
      <div class="select-value-container">
        <p class="text-(--field-placeholder-color)">i.e. United States</p>
        <input id="_r_51_" type="text" autocomplete="off" />
        <!-- filter input, appears on open -->
      </div>
      <svg class="rotate-180">…</svg>
      <!-- chevron -->
    </div>
  </div>
  <!-- option panel: rendered INSIDE the widget root, NOT portaled to <body> -->
  <div class="absolute z-15 …">
    <div tabindex="0" class="dropdown overflow-auto …">
      <div role="button" aria-label="Select option">United States</div>
      <div role="button" aria-label="Select option">Canada</div>
      …
      <!-- 248 rows -->
    </div>
  </div>
</div>
```

Findings that reshape the work:

- **Options are text-only.** All 248 rows are `<div role="button" aria-label="Select option">TEXT</div>`
  with **no `data-test-id`, no `data-value`, no `id`**. The visible text _is_ the
  value. Reusing option test-ids — the original idea — **cannot help this widget**;
  it needs robust role + accessible-name + text matching.
- **The list is NOT portaled.** It renders inside the `data-test-id="address-country"`
  container, which is inside the drawer. So "options escape the drawer and trip a
  coordinate-based outside-dismiss" is **not** the mechanism here. Clicking an
  option is a click _inside_ the drawer.
- **The existing selectors should already find & match these.** The stored option
  selector includes `[role="button"][aria-label*="option" i]` (matches
  `aria-label="Select option"`), and matching is by text (`United States` → exact).
- The trigger is a **searchable combobox** — a filter `<input>` appears inside it
  on open.

User confirmed (clarifying Q): **across the dropdowns they hit, many DO carry
option-level `data-test-id`/`data-value`.** So the automation-attribute locator is
genuinely valuable as a general tier — even though this specific example is the
text-only end of the spectrum. The design must cover **both** ends.

## The three problems, precisely

### Bug 1 — empty value → first option (the "first value" symptom). Confirmed.

Custom selects are _exempted_ from the "skip when no value proposed" guard
([fill.ts:81-84](../../../packages/form-scanner/src/fill.ts)), and `fillCustomSelect`
selects `openOptionNodes()[0]` when the normalized value is empty
([fill.ts:438-441](../../../packages/form-scanner/src/fill.ts)). The first country
option is literally **"United States"** → we choose garbage on purpose. Fixable
immediately, independent of the rest.

### Bug 2 — option finding/matching is ARIA/structure-biased.

Discovery leans on `role="option"`, `<ul><li>`, checkbox rows. It happens to work
for the country widget via the `aria-label*="option"` selector, but it is fragile
and **ignores automation attributes entirely** for both finding and matching.

### Bug 3 — the drawer collapses mid-fill.

Cannot be explained by the portal theory (options are inside the drawer). Most
likely a focus/blur interaction with the searchable combobox, an `Escape`/`blur`
cascade, or a `document`-level dismiss in the app's own bundle. **Unconfirmed —
must be reproduced, not guessed.**

## Design

### Principle: locate at FILL time, in tiers

Options don't exist at scan time, so option attributes must be read **live, after
opening**. The new matcher runs over the now-visible options and resolves the
proposed value through ordered tiers (best wins):

1. **Automation-attribute exact** — option carries `data-test-id` / `data-test` /
   `data-cy` / `data-qa` / `data-automation-id` / `data-testid` / `data-value` /
   `data-option-value` / `data-key` whose value equals the proposed value, a
   normalized code form, **or** the widget's id-namespace pattern
   (container `address-country` → option `address-country-option-<value>`).
2. **Accessible-name exact** — visible text, _discriminating_ `aria-label`, `title`
   (makes the country widget work).
3. **Contains / prefix** — last-resort fuzzy (as today).

Rejected alternatives:

- **(B) `chrome.debugger`/CDP trusted input** (literally drive the page like
  Playwright): solves event fidelity outright but needs the `debugger` permission,
  shows a "QuikFill is debugging this browser" banner, and is a large rewrite in
  `browser-adapter`. **Held as fallback** only if synthetic events prove unfixable
  for Bug 3.
- **(C) per-library adapters**: useless here — the target app is bespoke.

### Component changes

**`packages/schemas` — `CustomWidget` (no change)**

- Refined during planning: option attributes don't exist at scan time, and the
  widget's id-namespace (its container `data-test-id`) is already re-resolvable at
  fill time from `widgetEl`. So the matcher reads automation attributes **live**
  from the open option nodes using a module-constant attribute list — **no schema
  field, no serialization/redaction change** is needed. Simpler and lower-risk.

**`packages/form-scanner/src/extract.ts` — scan**

- No scan-time change required for matching (handled live at fill time).
- Optionally broaden the option selector set so automation-attribute-bearing nodes are
  recognised as options even without ARIA roles.

**`packages/form-scanner/src/fill.ts` — match & interact**

- **Bug 1:** empty proposed value → **skip** the custom select (remove the
  first-option behaviour and the empty-skip exemption).
- **Matcher (`optionTier`/`matchOption`):** add tier-1 automation-attribute
  matching over live options; keep name/contains/prefix below it.
- **Interaction (`clickElement`/`clickOption`/`closeOpenList`):** harden against
  the drawer-dismiss once reproduced (see below).

### Data flow

scan (closed) → record widget + automation namespace → plan → fill opens widget →
**live-collect** options → tiered match → dismiss-safe click → verify display
changed / option selected → close list safely (or skip/assisted on no value/no
match).

### Error handling

- No proposed value → `skip` (Bug 1 fix).
- Opened but no option matches → `assisted` ("open it and pick it manually").
- Clicked but display unchanged → `fail` reporting the displayed value.
- Never strand an open list (existing `closeOpenList` invariant preserved).

## Testing — reproduce before fixing (TDD)

- **Real-DOM fixtures:** commit reduced copies of `full.html` + `full-open.html`
  under `packages/form-scanner/src/__fixtures__/` and drive the real `applyFill`
  against them in jsdom. First time we test against the actual failing DOM.
- **Failing tests first:**
  - Country with **no proposed value** must `skip`, not select "United States"
    (Bug 1).
  - Country with value "Canada" must find the `role="button"` option by text and
    commit (Bug 2 baseline).
  - Synthetic fixture whose options carry `data-test-id`/`data-value` must match
    via tier 1 (Bug 2 new capability — the user-confirmed common case).
  - Drawer-dismiss reproduction: mount the open fixture inside a container wired
    with each common dismiss pattern (focus-out, `Escape`, `document` pointerdown
    - `!contains`) and assert the container stays open through a fill (Bug 3).
- If Bug 3's true mechanism lives in the app bundle and can't be reproduced
  offline, ship a ~5-line console tracer for the user to capture the exact
  teardown, then add the matching guard + regression test.

## Out of scope

- `chrome.debugger`/CDP input (fallback only).
- Datepicker behaviour (unchanged).
- Multi-select beyond confirming the new tiers apply (no new multi-select model).

## Open question (resolved during implementation, not blocking)

- Exact Bug 3 mechanism — resolved by the harness reproduction step above, or by
  the console tracer if it lives in the app's bundle.
