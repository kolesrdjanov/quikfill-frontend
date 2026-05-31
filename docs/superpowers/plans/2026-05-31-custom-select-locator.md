# Custom-select fill overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom-dropdown fills inside drawers reliable — stop auto-picking the first option when no value is proposed, match options by automation attributes (`data-test-id`/`data-value`/…) as a first-class tier, and prove the engine can't collapse a host drawer.

**Architecture:** All changes live in `packages/form-scanner/src/fill.ts` and its test file. The matcher runs at **fill time** over the live, now-open option list (option attributes don't exist at scan time, so nothing is read up front and **no schema change is needed**). A new top match-tier consults a constant set of automation attributes on each option node; the existing accessible-name/text tiers remain as fallback (the real captured country widget is text-only, so text matching must keep working).

**Tech Stack:** TypeScript, Vitest (jsdom env), pnpm workspaces. Quality gate: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test` (a husky pre-commit runs these).

**Ground truth:** Built from real captures `~/Desktop/full.html` (country select closed) and `~/Desktop/full-open.html` (open, 248 text-only `<div role="button" aria-label="Select option">TEXT</div>` rows, panel rendered _inside_ the in-drawer container). Spec: [`docs/superpowers/specs/2026-05-31-custom-select-locator-design.md`](../specs/2026-05-31-custom-select-locator-design.md).

**Already covered (do not rebuild):** text matching incl. generic `aria-label`, case-insensitive/whitespace, assisted-on-no-match, close-list-on-no-match (modal safety), **coordinate-based** outside-dismiss safety, searchable-combobox value-in-typeahead, fill-order (selects last). See existing `describe` blocks in `fill.test.ts`.

**Run tests from:** `packages/form-scanner/`. Single test: `pnpm vitest run src/fill.test.ts -t "<title>"`.

---

## Task 1: Bug 1 — no value proposed → skip the custom select (invert intentional behavior)

Today an empty `proposedValue` makes a custom select pick option `[0]` and report success — confirmed deliberate by the test "falls back to the first option only when no value was proposed". On the real country list the first option is "United States", which is exactly the user's "it prefilled the first value" complaint. New behavior: **empty → skip, leave the widget untouched.**

**Files:**

- Modify: `packages/form-scanner/src/fill.ts` (the empty-skip guard in `applyFill` ~lines 76-88; the single-select branch in `fillCustomSelect` ~lines 437-463; the order comment ~lines 59-67)
- Test: `packages/form-scanner/src/fill.test.ts` (invert the test at ~line 405; repurpose the test at ~line 412)

- [ ] **Step 1: Invert the existing empty-value tests**

In `fill.test.ts`, replace the test currently at ~line 405 ("falls back to the first option only when no value was proposed") and the one at ~line 412 ("fails cleanly when the opened dropdown exposes no options") with:

```ts
it('skips and leaves the widget untouched when no value was proposed', async () => {
  // Empty proposed value must NOT auto-pick: picking the first option silently
  // selected garbage (e.g. "United States" on a country list). Leave it alone.
  mountCustomSelect('Parking')
  const { results } = await applyFill([customInstruction('')])
  expect(document.querySelector('.val')!.textContent).toBe('Parking') // unchanged
  expect(results[0].status).toBe('skip')
})

it('reports assisted when opened with a real value but the list has no options', async () => {
  document.body.innerHTML = `
      <div id="cat" data-test-id="cat" name="cat">
        <div role="button" data-trigger="select" id="trigger">
          <div class="val">—</div>
        </div>
      </div>`
  const { results } = await applyFill([customInstruction('Office')])
  expect(results[0].status).toBe('assisted')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/fill.test.ts -t "no value was proposed"` and `-t "list has no options"`
Expected: FAIL — first still selects "Locker"/status success; second still returns `failed`.

- [ ] **Step 3: Drop the custom-select exemption from the empty-skip guard**

In `applyFill`, the guard currently reads:

```ts
if (
  ins.fillStrategy !== 'clickToggle' &&
  ins.fillStrategy !== 'customSelect' &&
  ins.proposedValue.trim() === ''
) {
  results.push(skip(ins.detectedFieldId, 'Nothing to fill — no value was proposed.'))
  continue
}
```

Remove the `ins.fillStrategy !== 'customSelect' &&` line so custom selects with no value are skipped (toggles stay exempt — empty is a meaningful "unchecked"). Update the adjacent comment (~lines 78-80) to: `// Toggles are exempt: an empty value on a toggle is a meaningful "unchecked".` Also delete the clause "and a custom select fills by clicking its first option, so it has nothing to type."

- [ ] **Step 4: Remove the first-option behavior inside `fillCustomSelect`**

Replace the single-select block (currently ~lines 437-463):

```ts
// --- Single select ---
const want = norm(ins.proposedValue)
const option =
  want === ''
    ? (openOptionNodes(widget, widgetEl, trigger, doc)[0] ?? null) // nothing to match → first
    : await resolveOption(widget, widgetEl, trigger, doc, ins.proposedValue)

if (!option) {
  // No selection to make. Close the list before bailing — see closeOpenList: an
  // open custom select left behind is an outside-dismiss layer that takes the
  // surrounding modal down with it as the rest of the fill moves focus.
  await closeOpenList(widget, widgetEl, trigger, doc)
  if (want === '') {
    return {
      result: fail(ins.detectedFieldId, 'Opened the dropdown but found no option to select.'),
      entry,
    }
  }
  return {
    result: assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Couldn't find "${ins.proposedValue}" in the dropdown — open it and pick it manually.`,
    ),
    entry,
  }
}
```

with:

```ts
// --- Single select ---
const option = await resolveOption(widget, widgetEl, trigger, doc, ins.proposedValue)

if (!option) {
  // No match. Close the list before bailing — see closeOpenList: an open custom
  // select left behind is an outside-dismiss layer that takes the surrounding
  // modal down with it as the rest of the fill moves focus.
  await closeOpenList(widget, widgetEl, trigger, doc)
  return {
    result: assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Couldn't find "${ins.proposedValue}" in the dropdown — open it and pick it manually.`,
    ),
    entry,
  }
}
```

Note: `applyFill` now skips empty before reaching here, so the `want === ''` path is dead and removed. If `fail` becomes unused elsewhere the linter will flag it — it is still used later in this function ("Clicked … but the dropdown still shows …"), so the import stays.

- [ ] **Step 5: Run the two tests to verify they pass**

Run: `pnpm vitest run src/fill.test.ts -t "no value was proposed"` and `-t "list has no options"`
Expected: PASS.

- [ ] **Step 6: Run the whole filler suite (no regressions)**

Run: `pnpm vitest run src/fill.test.ts`
Expected: PASS (all existing custom-select tests still green).

- [ ] **Step 7: Commit**

```bash
git add packages/form-scanner/src/fill.ts packages/form-scanner/src/fill.test.ts
git commit -m "fix(fill): skip custom selects with no proposed value instead of picking the first option"
```

---

## Task 2: Bug 2a — match options by automation attributes (first-class tier)

User-confirmed: many target dropdowns carry option-level `data-test-id`/`data-value`/`data-*`. Add a top tier so a proposed code ("US") matches `data-value="US"` even when the visible text is "United States". Text matching stays as fallback (the country widget has no such attrs).

**Files:**

- Modify: `packages/form-scanner/src/fill.ts` (add `OPTION_AUTOMATION_ATTRS` constant near the other option constants ~line 659; add `optionAutomationValues` helper; extend `optionTier` ~lines 811-828)
- Test: `packages/form-scanner/src/fill.test.ts` (new `describe` block after the existing custom-select blocks)

- [ ] **Step 1: Write the failing tests**

Add to `fill.test.ts`:

```ts
const attrWidget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: ['#trigger'],
  valueDisplaySelectorCandidates: ['.val'],
  optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
  optionsOpenOnDemand: false,
  isSearchable: false,
  isVirtualized: false,
}

function mountAttrSelect() {
  document.body.innerHTML = `
    <div id="cat" data-test-id="cat" name="cat">
      <div role="button" data-trigger="select" id="trigger"><div class="val">—</div></div>
      <div class="dropdown">
        <div role="option" data-value="US" data-test-id="cat-option-US">United States</div>
        <div role="option" data-value="CA" data-test-id="cat-option-CA">Canada</div>
        <div role="option" data-value="MX" data-test-id="cat-option-MX">Mexico</div>
      </div>
    </div>`
  const val = document.querySelector('.val')!
  for (const opt of Array.from(document.querySelectorAll('.dropdown [role="option"]'))) {
    opt.addEventListener('click', () => {
      val.textContent = opt.textContent
    })
  }
}

function attrInstruction(proposedValue: string): FillInstruction {
  return {
    detectedFieldId: 'cat',
    selectorCandidates: ['#cat'],
    frame: 'main',
    shadow: false,
    tagName: 'div',
    inputType: 'customSelect',
    fillStrategy: 'customSelect',
    proposedValue,
    customWidget: attrWidget,
  }
}

describe('applyFill — custom select (automation-attribute matching)', () => {
  it('matches a proposed code against data-value', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('CA')])
    expect(document.querySelector('.val')!.textContent).toBe('Canada')
    expect(results[0].status).toBe('success')
  })

  it('matches the trailing segment of a data-test-id', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('MX')])
    expect(document.querySelector('.val')!.textContent).toBe('Mexico')
    expect(results[0].status).toBe('success')
  })

  it('still matches the human label by text when the code is not used', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('United States')])
    expect(document.querySelector('.val')!.textContent).toBe('United States')
    expect(results[0].status).toBe('success')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/fill.test.ts -t "automation-attribute matching"`
Expected: FAIL — `CA`/`MX` don't match (today only `text`/`title`/`aria-label`/single `optionValueAttr` are consulted, and `optionValueAttr` is null for on-demand selects).

- [ ] **Step 3: Add the constant and helper**

Near the option-selector constants (just above `ARIA_OPTION_SELECTORS`, ~line 659) add:

```ts
/**
 * Automation/value attributes an option may carry a stable handle in, à la a
 * Playwright locator. Consulted at fill time on the LIVE option nodes (they don't
 * exist at scan time). Both the whole value and its trailing segment are matched,
 * so `data-test-id="cat-option-US"` resolves a proposed code "US".
 */
const OPTION_AUTOMATION_ATTRS = [
  'data-test-id',
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-automation-id',
  'data-value',
  'data-option-value',
  'data-key',
  'value',
]

/** Normalized automation-attribute values on an option (whole value + trailing segment). */
function optionAutomationValues(node: Element, widget: CustomWidget): string[] {
  const attrs = new Set(
    widget.optionValueAttr
      ? [...OPTION_AUTOMATION_ATTRS, widget.optionValueAttr]
      : OPTION_AUTOMATION_ATTRS,
  )
  const out: string[] = []
  for (const attr of attrs) {
    const raw = node.getAttribute(attr)
    if (!raw) continue
    const whole = norm(raw)
    if (whole) out.push(whole)
    const seg = norm(raw.split(/[-_/.\s]+/).pop() ?? '')
    if (seg) out.push(seg)
  }
  return out
}
```

- [ ] **Step 4: Make automation-attribute exact the strongest tier**

Replace `optionTier` (~lines 811-828) with:

```ts
/** Match strength of one option against a normalized target (lower = stronger; 0 = no match). */
function optionTier(node: Element, widget: CustomWidget, want: string, ariaLabel: string): number {
  // An inner <label> is the value text for checkbox/li-style options.
  const label = node.querySelector('label')
  const names = [
    norm(textOf(node)),
    norm(label ? textOf(label) : ''),
    norm(ariaLabel),
    norm(node.getAttribute('title') ?? ''),
  ].filter(Boolean)
  // Tier 1: a stable automation/value handle equals the target (or its trailing
  // segment does) — the Playwright-style locator, strongest when present.
  if (optionAutomationValues(node, widget).includes(want)) return 1
  if (names.some((n) => n === want)) return 2 // exact accessible name
  if (names.some((n) => n.includes(want) || want.includes(n))) return 3 // contains
  if (names.some((n) => n.startsWith(want) || want.startsWith(n))) return 4 // prefix
  return 0
}
```

(The old separate `optionValueAttr` tier is now subsumed by tier 1, which also checks `widget.optionValueAttr`.)

- [ ] **Step 5: Run to verify pass + no regressions**

Run: `pnpm vitest run src/fill.test.ts`
Expected: PASS (new block green; existing text-matching tests still green).

- [ ] **Step 6: Commit**

```bash
git add packages/form-scanner/src/fill.ts packages/form-scanner/src/fill.test.ts
git commit -m "feat(fill): match custom-select options by automation attributes (data-test-id/data-value) as the strongest tier"
```

---

## Task 3: Bug 2b — find options that carry automation attributes but no ARIA role

Some apps render option rows as `<div data-test-id="x-option-…">TEXT</div>` with no `role`, not in a `<ul>`. The current finders (ARIA roles → `ul>li` → checkbox rows) miss them. Add a namespace-scoped automation-attribute finder as the last resort, so it never matches unrelated page nodes.

**Files:**

- Modify: `packages/form-scanner/src/fill.ts` (`openOptionNodes` ~lines 674-695; add `automationOptions` helper)
- Test: `packages/form-scanner/src/fill.test.ts` (new test)

- [ ] **Step 1: Write the failing test**

Add to `fill.test.ts`:

```ts
describe('applyFill — custom select (finds role-less automation-attribute options)', () => {
  it('locates options that have only a namespaced data-test-id', async () => {
    document.body.innerHTML = `
      <div id="cat" data-test-id="cat" name="cat">
        <div role="button" data-trigger="select" id="trigger"><div class="val">—</div></div>
        <div class="dropdown">
          <div data-test-id="cat-option-locker">Locker</div>
          <div data-test-id="cat-option-office">Office</div>
        </div>
      </div>`
    const val = document.querySelector('.val')!
    for (const opt of Array.from(document.querySelectorAll('.dropdown [data-test-id]'))) {
      opt.addEventListener('click', () => {
        val.textContent = opt.textContent
      })
    }
    const widget: CustomWidget = {
      kind: 'select',
      triggerSelectorCandidates: ['#trigger'],
      valueDisplaySelectorCandidates: ['.val'],
      optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
      optionsOpenOnDemand: false,
      isSearchable: false,
      isVirtualized: false,
    }
    const { results } = await applyFill([
      {
        detectedFieldId: 'cat',
        selectorCandidates: ['#cat'],
        frame: 'main',
        shadow: false,
        tagName: 'div',
        inputType: 'customSelect',
        fillStrategy: 'customSelect',
        proposedValue: 'Office',
        customWidget: widget,
      },
    ])
    expect(document.querySelector('.val')!.textContent).toBe('Office')
    expect(results[0].status).toBe('success')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/fill.test.ts -t "role-less automation-attribute options"`
Expected: FAIL — `openOptionNodes` finds nothing (no ARIA role, no `<li>`, no checkbox), so the fill reports `assisted`.

- [ ] **Step 3: Add a namespace-scoped automation finder**

Add this helper near `structuralOptions` (~line 713):

```ts
/** Attributes whose presence (scoped to the widget) marks an automation-tagged option row. */
const OPTION_AUTOMATION_FIND_ATTRS = ['data-test-id', 'data-testid', 'data-cy', 'data-qa']

/**
 * Option rows that expose no ARIA role and no list structure, only an automation
 * attribute (e.g. `<div data-test-id="cat-option-US">`). Restricted to the widget's
 * own id-namespace (the container's data-test-id prefix) when it has one, so a
 * stray test-id elsewhere in the panel can't be mistaken for an option.
 */
function automationOptions(scope: ParentNode, trigger: Element, widgetEl: Element): Element[] {
  const ns = OPTION_AUTOMATION_FIND_ATTRS.map((a) => widgetEl.getAttribute(a)).find(Boolean)
  const selector = OPTION_AUTOMATION_FIND_ATTRS.map((a) =>
    ns ? `[${a}^="${cssEscapeAttr(ns)}"]` : `[${a}]`,
  ).join(', ')
  let nodes: Element[]
  try {
    nodes = Array.from(scope.querySelectorAll(selector))
  } catch {
    return []
  }
  return nodes.filter(
    (n) =>
      n !== trigger &&
      n !== widgetEl &&
      !trigger.contains(n) &&
      !n.contains(trigger) &&
      // Leaf-ish rows only: skip a node that merely wraps other option rows.
      !OPTION_AUTOMATION_FIND_ATTRS.some((a) => n.querySelector(`[${a}]`)) &&
      textOf(n) !== '',
  )
}

/** Escape a value for use inside an attribute selector's quoted string. */
function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}
```

Then in `openOptionNodes`, extend the structural fallback loop (currently ~lines 688-693) so it also tries `automationOptions`:

```ts
// Structural fallback — scope to the widget / linked panel ONLY (never document-wide,
// or unrelated page lists would match).
for (const scope of [linked, widgetEl].filter((s) => s !== null) as ParentNode[]) {
  const rows = structuralOptions(scope, trigger)
  if (rows.length) return rows
  const tagged = automationOptions(scope, trigger, widgetEl)
  if (tagged.length) return tagged
}
return []
```

- [ ] **Step 4: Run to verify pass + no regressions**

Run: `pnpm vitest run src/fill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/form-scanner/src/fill.ts packages/form-scanner/src/fill.test.ts
git commit -m "feat(fill): find role-less options by namespaced automation attributes"
```

---

## Task 4: Bug 3 — prove the engine can't collapse a drawer via uncovered dismiss mechanisms

The coordinate-based outside-dismiss is already guarded. Add regression guards for the dismiss styles real apps use that are NOT yet covered: target/`composedPath`-based document listeners, and focus-out. The country widget renders its options _inside_ the drawer, so a correct engine must never trip these. These tests should pass against the current code (proving safety); if any fails, the fix is in `clickElement`/`clickOption`/`closeOpenList` (e.g. never dispatch on `document`/`window`; press the option node itself, which is in-drawer).

**Files:**

- Test: `packages/form-scanner/src/fill.test.ts` (new tests in the existing "emits faithful, in-bounds pointer input" describe block or a new block)
- Modify (only if a test fails): `packages/form-scanner/src/fill.ts`

- [ ] **Step 1: Write the guard tests**

Add to `fill.test.ts`:

```ts
describe('applyFill — custom select does not trip non-coordinate drawer dismissals', () => {
  it('keeps a drawer open whose dismiss checks event target containment', async () => {
    mountCustomSelect('Parking')
    const drawer = document.getElementById('cat')! // options live INSIDE it
    let drawerOpen = true
    const dismiss = (e: Event): void => {
      const path = (e.composedPath?.() ?? [e.target]) as EventTarget[]
      if (!path.includes(drawer) && !drawer.contains(e.target as Node)) drawerOpen = false
    }
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      document.addEventListener(type, dismiss, true)
    }
    try {
      const { results } = await applyFill([customInstruction('Office')])
      expect(drawerOpen).toBe(true)
      expect(results[0].status).toBe('success')
    } finally {
      for (const type of ['pointerdown', 'mousedown', 'click']) {
        document.removeEventListener(type, dismiss, true)
      }
    }
  })

  it('keeps a drawer open whose dismiss closes on focus leaving it', async () => {
    mountCustomSelect('Parking')
    const drawer = document.getElementById('cat')!
    let drawerOpen = true
    const onFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget as Node | null
      if (next && !drawer.contains(next)) drawerOpen = false
    }
    document.addEventListener('focusout', onFocusOut as EventListener, true)
    try {
      const { results } = await applyFill([customInstruction('Office')])
      expect(drawerOpen).toBe(true)
      expect(results[0].status).toBe('success')
    } finally {
      document.removeEventListener('focusout', onFocusOut as EventListener, true)
    }
  })
})
```

- [ ] **Step 2: Run the guard tests**

Run: `pnpm vitest run src/fill.test.ts -t "non-coordinate drawer dismissals"`
Expected: PASS (the engine presses in-drawer nodes and never dispatches on `document`/`window`).

- [ ] **Step 3: If a test FAILS, fix the dispatch path**

Diagnose in `clickElement` (~line 1181), `clickOption` (~line 835), `closeOpenList` (~line 501): ensure every synthetic event is dispatched on the in-drawer option/trigger node (never `document`/`window`), and that no `blur()`/`focus()` moves focus to a node outside the drawer. Re-run Step 2 until PASS. (If they already pass, no `fill.ts` change is needed — record that the in-DOM dismiss styles are safe and the residual real-world collapse is investigated in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add packages/form-scanner/src/fill.test.ts packages/form-scanner/src/fill.ts
git commit -m "test(fill): guard against target- and focus-based drawer dismissals during custom-select fill"
```

---

## Task 5: Verify against the real captures + live tracer contingency

The unit tests model the captured widget faithfully, but the real drawer's dismiss logic lives in the app's own bundle. This task confirms behavior end-to-end and, if the drawer still collapses in the live extension, captures the exact mechanism instead of guessing.

**Files:**

- Create: `docs/superpowers/notes/2026-05-31-drawer-dismiss-tracer.md` (the console tracer + how to read it)

- [ ] **Step 1: Confirm the full suite + quality gate is green**

Run (from `frontend/`): `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 2: Write the live tracer doc**

Create `docs/superpowers/notes/2026-05-31-drawer-dismiss-tracer.md` containing this snippet for the user to paste in the page console _before_ running a fill, so any drawer teardown logs the event + stack:

````markdown
# Drawer-dismiss tracer

Paste in the page DevTools console on the failing form, then run a QuikFill fill.
If the drawer collapses, the console prints which event + the listener stack that
removed it.

```js
;(() => {
  const drawer = document.querySelector('.drawer, [role="dialog"], [aria-modal="true"]')
  if (!drawer) return console.warn('no drawer found')
  new MutationObserver((m) => {
    for (const r of m)
      for (const n of r.removedNodes)
        if (n === drawer || (n.contains && n.contains(drawer)))
          console.warn('DRAWER REMOVED', new Error().stack)
  }).observe(document.body, { childList: true, subtree: true })
  for (const t of ['pointerdown', 'mousedown', 'click', 'focusout', 'keydown'])
    document.addEventListener(
      t,
      (e) => console.log('evt', t, 'target=', e.target, 'trusted=', e.isTrusted),
      true,
    )
  console.log('tracer armed')
})()
```

Read it as: the last `evt …` before `DRAWER REMOVED` is the dismiss trigger; the
stack shows the app handler. Feed that back to extend Task 4's guards with the
real mechanism + a regression test.
````

- [ ] **Step 3: Build the extension and hand off for a live check**

Run (from `frontend/`): `pnpm --filter @quikfill/chrome-extension build`
Expected: builds clean. Then load `apps/chrome-extension/.output/chrome-mv3` unpacked in Chrome and run a fill on the facility-creation drawer with a profile that HAS a country and one that does NOT.
Verify: (a) with a country value → the dropdown selects it and the drawer stays open; (b) with no country → the dropdown is left untouched (no "United States"). If the drawer still collapses, run the tracer from Step 2 and extend Task 4.

- [ ] **Step 4: Commit the note**

```bash
git add docs/superpowers/notes/2026-05-31-drawer-dismiss-tracer.md
git commit -m "docs: drawer-dismiss tracer for diagnosing live custom-select drawer collapse"
```

---

## Self-review notes

- **Spec coverage:** Bug 1 → Task 1; Bug 2 matching (the user-confirmed need) → Task 2; Bug 2 finding → Task 3; Bug 3 → Tasks 4–5. The spec's "add schema fields" was refined away — option attributes are read live at fill time, so no `CustomWidget`/redaction change is needed (simpler, lower risk). Update the spec's "Component changes → schemas" bullet to reflect this if it confuses a reader.
- **Type consistency:** `OPTION_AUTOMATION_ATTRS`, `optionAutomationValues`, `OPTION_AUTOMATION_FIND_ATTRS`, `automationOptions`, `cssEscapeAttr` are introduced in Tasks 2–3 and referenced consistently. `optionTier` keeps its `(node, widget, want, ariaLabel)` signature.
- **No silent caps:** the automation finder is namespace-scoped on purpose (documented) to avoid false positives; falls back to `[data-*]` only when the container has no namespace.
