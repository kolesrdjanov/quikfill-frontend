import type {
  CustomWidget,
  FillInstruction,
  FillResult,
  UndoEntry,
  UndoSnapshot,
} from '@quikfill/schemas'
import { coerceToMask, getMaskSpec, valuesMatch } from './mask'

export interface FillOutcome {
  results: FillResult[]
  undoSnapshot: UndoSnapshot
}

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement
/**
 * Where a fill resolves elements. The scan resolves a container (a drawer/dialog
 * Element, or the whole Document) and the fill is confined to it — so a fuzzy
 * selector can never reach an element outside the drawer and trip its
 * click-outside dismiss. Shadow roots appear during deep traversal.
 */
type FillRoot = Document | ShadowRoot | Element

/** The Document a node belongs to (itself, when the node already is a Document). */
function ownerDocOf(node: Node): Document {
  return node.ownerDocument ?? (node as Document)
}

/**
 * Whether a node lives within the scoped root. A Document/ShadowRoot root keeps the
 * old whole-page behavior; an Element root scopes to its subtree. Uses nodeType +
 * `contains` (not `instanceof`) because the page and the content script are
 * different realms, so the page's Element fails the script's `instanceof Element`.
 */
function withinRoot(root: FillRoot, node: Node): boolean {
  if (root.nodeType !== 1) return true
  return (root as Element).contains(node)
}

const TRUTHY = new Set(['true', 'on', 'yes', '1', 'checked'])

/**
 * Apply a batch of fill instructions to the page. Captures an undo snapshot
 * first, writes via native setters + event dispatch (or click-drives custom
 * widgets), verifies each value, and returns structured per-field results.
 * Async because custom widgets must wait a tick for the framework to re-render.
 * Never throws on a single bad field.
 */
export async function applyFill(
  instructions: FillInstruction[],
  root: FillRoot = document,
): Promise<FillOutcome> {
  const results: FillResult[] = []
  const entries: UndoEntry[] = []
  // Elements already written this batch — never targeted twice (a later field's
  // value must not overwrite an earlier field's element via a shared selector).
  const claimed = new Set<Element>()

  // Fill order: plain fields → custom selects → assisted-autocomplete.
  // A custom select must OPEN its option list to pick, and an open list is an
  // outside-dismiss layer: if a later field write moves focus while it's open, the
  // list's dismiss fires and — inside a hand-rolled modal/drawer that closes on
  // outside-interaction — cascades to tear down the whole modal mid-fill. Deferring
  // every custom select until the plain fields are done guarantees no open list
  // ever coexists with a pending write (and opening the next select closes the
  // prior one as an inside click). Assisted-autocomplete stays dead last — it
  // intentionally leaves its OWN suggestion list open for the user to pick from.
  const ordered = [
    ...instructions.filter(
      (i) => i.fillStrategy !== 'customSelect' && i.fillStrategy !== 'assistedAutocomplete',
    ),
    ...instructions.filter((i) => i.fillStrategy === 'customSelect'),
    ...instructions.filter((i) => i.fillStrategy === 'assistedAutocomplete'),
  ]

  for (const ins of ordered) {
    // No value to write (unknown field, AI-draft stub, missing generator) — skip
    // rather than write "" and falsely report success. Toggles are exempt: an empty
    // value on a toggle is a meaningful "unchecked". A custom select with no proposed
    // value is left untouched too — we never auto-pick its first option (that silently
    // selected garbage, e.g. "United States" on a country list).
    if (ins.fillStrategy !== 'clickToggle' && ins.proposedValue.trim() === '') {
      results.push(skip(ins.detectedFieldId, 'Nothing to fill — no value was proposed.'))
      continue
    }

    if (ins.fillStrategy === 'customSelect' && ins.customWidget) {
      const { result, entry } = await fillCustomSelect(ins, ins.customWidget, root, claimed)
      results.push(result)
      if (entry) entries.push(entry)
      continue
    }

    if (ins.inputType === 'radiogroup') {
      const { result, entry } = fillRadioGroup(ins, root, claimed)
      results.push(result)
      if (entry) entries.push(entry)
      continue
    }

    const el = findElement(
      root,
      markedSelectors(ins.detectedFieldId, ins.selectorCandidates),
      claimed,
    )
    if (!el) {
      results.push(skip(ins.detectedFieldId, 'Element not found on the page.'))
      continue
    }
    claimed.add(el)
    if (ins.fillStrategy === 'assistedAutocomplete') {
      entries.push(capture(ins, el))
      results.push(assistAutocomplete(ins, el))
      continue
    }
    if (isDisabled(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is disabled.'))
      continue
    }
    if (isReadonly(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is read-only.'))
      continue
    }

    entries.push(capture(ins, el))

    try {
      results.push(await writeAndVerify(ins, el))
    } catch (e) {
      results.push(fail(ins.detectedFieldId, e instanceof Error ? e.message : 'Fill failed.'))
    }
  }

  return { results, undoSnapshot: { entries, capturedAt: new Date().toISOString() } }
}

/** Restore the values captured in a snapshot (undo the most recent fill). */
export async function applyUndo(
  snapshot: UndoSnapshot,
  root: FillRoot = document,
): Promise<FillResult[]> {
  const results: FillResult[] = []
  for (const entry of snapshot.entries) {
    if (entry.customWidget) {
      results.push(await undoCustomSelect(entry, entry.customWidget, root))
      continue
    }
    if (entry.inputType === 'radiogroup') {
      results.push(undoRadioGroup(entry, root))
      continue
    }
    const el = findElement(root, markedSelectors(entry.detectedFieldId, entry.selectorCandidates))
    if (!el) {
      results.push(skip(entry.detectedFieldId, 'Element not found on the page.'))
      continue
    }
    try {
      if (isToggle(el) && entry.previousChecked !== undefined) {
        setChecked(el as HTMLInputElement, entry.previousChecked)
      } else {
        setValue(el, entry.previousValue ?? '')
      }
      results.push(success(entry.detectedFieldId, entry.previousValue))
    } catch (e) {
      results.push(fail(entry.detectedFieldId, e instanceof Error ? e.message : 'Undo failed.'))
    }
  }
  return results
}

async function writeAndVerify(ins: FillInstruction, el: Fillable): Promise<FillResult> {
  if (isToggle(el)) {
    const desired = TRUTHY.has(ins.proposedValue.toLowerCase().trim())
    setChecked(el as HTMLInputElement, desired)
    return (el as HTMLInputElement).checked === desired
      ? success(ins.detectedFieldId, String(desired))
      : fail(ins.detectedFieldId, 'Checkbox/radio did not accept the toggle.')
  }

  // A native <select> accepts only an option *value*, but the proposed value is
  // often a human *label* (from a saved record or AI). Resolve label → value so
  // those fills land instead of silently failing.
  if (el.tagName.toLowerCase() === 'select') {
    const value = resolveSelectOption(el as HTMLSelectElement, ins.proposedValue)
    if (value === null) {
      return fail(ins.detectedFieldId, `No option matching "${ins.proposedValue}" in the dropdown.`)
    }
    setValue(el, value)
    await settle()
    return readValue(el) === value
      ? success(ins.detectedFieldId, value)
      : fail(ins.detectedFieldId, `Select did not accept "${value}".`)
  }

  // Coerce to the field's input mask (maska et al.) so the right characters land
  // — otherwise the mask reshapes our raw value (e.g. a phone country code shifts
  // into the area code). `valuesMatch` then ignores the delimiters the mask
  // inserts, so a correctly-filled-but-reformatted field is not a false failure.
  const spec = getMaskSpec(el)
  const target = (spec && coerceToMask(ins.proposedValue, spec)) || ins.proposedValue

  setValue(el, target)
  await settle()
  const accepted = readValue(el)
  if (valuesMatch(accepted, target)) {
    return success(ins.detectedFieldId, accepted)
  }
  return fail(ins.detectedFieldId, `Value not accepted (wanted "${target}", got "${accepted}").`)
}

/**
 * Type into an autocomplete-driven input (e.g. Google Places) to surface its
 * suggestion dropdown for the user to pick from. We focus, set the value, and
 * fire a keystroke-shaped event sequence to nudge the widget's prediction fetch
 * — but deliberately never `blur`, which would close/clear the dropdown. We do
 * NOT verify: no result is "filled" until the user selects a suggestion (which
 * is what populates the site's dependent fields).
 */
function assistAutocomplete(ins: FillInstruction, el: Fillable): FillResult {
  const value = ins.proposedValue
  focusEl(el)
  setNativeValue(el, value)
  dispatchKey(el, 'keydown')
  dispatch(el, 'input')
  dispatchKey(el, 'keyup')
  return assisted(
    ins.detectedFieldId,
    value,
    `Typed "${value}" — pick the matching result from the dropdown.`,
  )
}

function focusEl(el: Fillable): void {
  if (typeof el.focus === 'function') {
    try {
      el.focus()
    } catch {
      /* focus can throw on detached nodes */
    }
  }
}

function dispatchKey(el: Element, type: 'keydown' | 'keyup', key = 'Unidentified'): void {
  let ev: Event
  try {
    ev = new KeyboardEvent(type, { bubbles: true, key })
  } catch {
    ev = new Event(type, { bubbles: true })
  }
  el.dispatchEvent(ev)
}

function capture(ins: FillInstruction, el: Fillable): UndoEntry {
  return {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    previousValue: readValue(el),
    previousChecked: isToggle(el) ? (el as HTMLInputElement).checked : undefined,
  }
}

// --- Radio group (one field, N same-name radios) --------------------------

/**
 * Select the radio in a group whose value (or visible label) matches the proposed
 * value, and capture the previously-selected value for undo. The group is resolved
 * by the name selector, so every member is considered — not just the first match.
 */
function fillRadioGroup(
  ins: FillInstruction,
  root: FillRoot,
  claimed: Set<Element>,
): { result: FillResult; entry?: UndoEntry } {
  const radios = collectRadios(root, ins.selectorCandidates).filter((r) => !claimed.has(r))
  if (radios.length === 0) {
    return { result: skip(ins.detectedFieldId, 'Element not found on the page.') }
  }
  const previous = radios.find((r) => r.checked) ?? null
  const want = norm(ins.proposedValue)
  const target =
    radios.find((r) => r.value === ins.proposedValue) ??
    radios.find((r) => norm(radioLabel(r)) === want)
  if (!target) {
    return { result: fail(ins.detectedFieldId, `No "${ins.proposedValue}" option in the group.`) }
  }
  if (isDisabled(target)) return { result: skip(ins.detectedFieldId, 'Field is disabled.') }
  claimed.add(target)

  const entry: UndoEntry = {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    inputType: 'radiogroup',
    previousValue: previous?.value ?? '',
  }
  setChecked(target, true)
  return target.checked
    ? { result: success(ins.detectedFieldId, target.value), entry }
    : { result: fail(ins.detectedFieldId, 'Radio option did not accept the selection.'), entry }
}

function undoRadioGroup(entry: UndoEntry, root: FillRoot): FillResult {
  const radios = collectRadios(root, entry.selectorCandidates)
  if (radios.length === 0) return skip(entry.detectedFieldId, 'Element not found on the page.')
  const prev = entry.previousValue ?? ''
  if (prev === '') {
    // Nothing was selected before — clear whatever the fill checked.
    for (const r of radios) if (r.checked) setChecked(r, false)
    return success(entry.detectedFieldId, '')
  }
  const target = radios.find((r) => r.value === prev)
  if (!target) return skip(entry.detectedFieldId, `Couldn't restore previous selection "${prev}".`)
  setChecked(target, true) // checking one radio unchecks its siblings natively
  return success(entry.detectedFieldId, prev)
}

/**
 * Resolve a proposed value to a `<select>` option's value: exact value, exact
 * label, then case/whitespace-insensitive label or value. Returns the option's
 * value, or null when nothing matches.
 */
function resolveSelectOption(select: HTMLSelectElement, want: string): string | null {
  const options = Array.from(select.options)
  const wantNorm = norm(want)
  const match =
    options.find((o) => o.value === want) ??
    options.find((o) => (o.textContent ?? '').trim() === want) ??
    options.find((o) => norm(o.textContent ?? '') === wantNorm) ??
    options.find((o) => norm(o.value) === wantNorm)
  return match ? match.value : null
}

/** A radio's visible label (wrapping `<label>` text), falling back to its value. */
function radioLabel(radio: HTMLInputElement): string {
  const wrap = radio.closest('label')?.textContent?.replace(/\s+/g, ' ').trim()
  return wrap || radio.value
}

/** Every radio matching any selector, across open shadow roots and same-origin iframes. */
function collectRadios(root: FillRoot, selectors: string[]): HTMLInputElement[] {
  const out: HTMLInputElement[] = []
  const seen = new Set<Element>()
  for (const selector of selectors) collectRadiosInto(root, selector, out, seen)
  return out
}

function collectRadiosInto(
  root: FillRoot,
  selector: string,
  out: HTMLInputElement[],
  seen: Set<Element>,
): void {
  let matches: Element[]
  try {
    matches = Array.from(root.querySelectorAll(selector))
  } catch {
    matches = []
  }
  for (const m of matches) {
    if (
      !seen.has(m) &&
      m.tagName.toLowerCase() === 'input' &&
      (m as HTMLInputElement).type === 'radio'
    ) {
      seen.add(m)
      out.push(m as HTMLInputElement)
    }
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) collectRadiosInto(shadow, selector, out, seen)
    const frameDoc = frameDocument(el)
    if (frameDoc) collectRadiosInto(frameDoc, selector, out, seen)
  }
}

// --- Custom (non-native) select -------------------------------------------

/**
 * Fill a custom (non-native) widget by driving it the way a user would: open it,
 * find the option whose accessible name matches the proposed value, and click it —
 * never by setting a value or `aria-selected` (which the framework ignores).
 * Branches by widget kind (single select, multi-select, datepicker). When no option
 * matches a non-empty value, returns `assisted` with the list left open rather than
 * silently picking the wrong (first) option. An empty proposed value keeps the
 * legacy first-option fill (there is nothing to match against).
 */
async function fillCustomSelect(
  ins: FillInstruction,
  widget: CustomWidget,
  root: FillRoot,
  claimed: Set<Element>,
): Promise<{ result: FillResult; entry?: UndoEntry }> {
  const widgetEl = findElement(
    root,
    markedSelectors(ins.detectedFieldId, ins.selectorCandidates),
    claimed,
  )
  if (!widgetEl) return { result: skip(ins.detectedFieldId, 'Element not found on the page.') }
  claimed.add(widgetEl)

  // The widget is resolved within the scoped root, but its option list is often
  // portaled to <body> — OUTSIDE the drawer — so the open-list lookups search the
  // whole owning document, not the scoped root.
  const doc = ownerDocOf(widgetEl)
  const trigger = findElement(root, widget.triggerSelectorCandidates) ?? widgetEl
  const previousDisplayText = readDisplay(widgetEl, widget, doc)
  const entry: UndoEntry = {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    previousValue: null,
    previousDisplayText,
    customWidget: widget,
  }

  if (widget.kind === 'datepicker') {
    return { result: await fillDatePicker(ins, widgetEl, trigger, root, doc), entry }
  }

  clickElement(trigger)
  await settle()

  // Multi-select is detected from the OPEN list too (checkbox rows / aria-multiselectable),
  // not just the scan-time kind — a closed ARIA-less widget can't reveal it earlier.
  if (isMultiSelect(widget, widgetEl, trigger, doc)) {
    return { result: await selectMultiple(ins, widget, widgetEl, trigger, root, doc), entry }
  }

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
  const chosenLabel = optionLabelText(option)

  clickOption(option, trigger, root)
  await settle()
  if (selectionLanded(widgetEl, widget, doc, previousDisplayText, chosenLabel, option)) {
    return { result: success(ins.detectedFieldId, chosenLabel || null), entry }
  }

  // The click didn't commit — try the keyboard path (covers roving-focus and
  // aria-activedescendant widgets whose option element ignores synthetic clicks).
  selectByKeyboard(trigger, option)
  await settle()
  if (selectionLanded(widgetEl, widget, doc, previousDisplayText, chosenLabel, option)) {
    return { result: success(ins.detectedFieldId, chosenLabel || null), entry }
  }

  // Couldn't commit the pick — make sure we don't strand an open list (see above).
  await closeOpenList(widget, widgetEl, trigger, doc)
  return {
    result: fail(
      ins.detectedFieldId,
      `Clicked "${chosenLabel}" but the dropdown still shows "${readDisplay(widgetEl, widget, doc)}".`,
    ),
    entry,
  }
}

/**
 * Dismiss an open custom-select list WITHOUT disturbing a surrounding modal. A
 * custom select we opened and didn't commit is its own outside-dismiss layer:
 * leaving it open lets it fire an interact/focus-outside as the rest of the fill
 * proceeds, which cascades to the host drawer and closes the whole thing (every
 * later field then reports "element not found"). Re-pressing the trigger — the
 * inverse of the open click the drawer already tolerated, and which re-focuses the
 * trigger inside the scoped root — toggles the list shut without ever producing an
 * event the modal's own outside-dismiss reads as "outside". No-op if already closed.
 */
async function closeOpenList(
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
): Promise<void> {
  if (openOptionNodes(widget, widgetEl, trigger, doc).length === 0) return
  clickElement(trigger)
  await settle()
}

/**
 * Select several values in a multi-select. Splits the proposed value on commas /
 * newlines, clicks the option matching each token, re-opening the list between
 * picks for widgets that close on every selection. Reports `assisted` listing any
 * tokens that couldn't be found.
 */
async function selectMultiple(
  ins: FillInstruction,
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  root: FillRoot,
  doc: Document,
): Promise<FillResult> {
  const tokens = ins.proposedValue
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) {
    return assisted(ins.detectedFieldId, ins.proposedValue, 'No values to select.')
  }
  const landed: string[] = []
  const missed: string[] = []
  for (const token of tokens) {
    const option = await resolveOption(widget, widgetEl, trigger, doc, token)
    if (!option) {
      missed.push(token)
      continue
    }
    const label = optionLabelText(option)
    clickOption(option, trigger, root)
    await settle()
    if (optionIsSelected(option)) landed.push(label)
    else missed.push(token)
    // Some multiselects collapse the list on each pick — reopen for the next token.
    if (openOptionNodes(widget, widgetEl, trigger, doc).length === 0) {
      clickElement(trigger)
      await settle()
    }
  }
  const quoted = (xs: string[]): string => xs.map((x) => `"${x}"`).join(', ')
  if (missed.length === 0) return success(ins.detectedFieldId, landed.join(', '))
  if (landed.length === 0) {
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Couldn't find ${quoted(missed)} — pick them from the open list.`,
    )
  }
  return assisted(
    ins.detectedFieldId,
    landed.join(', '),
    `Selected ${quoted(landed)}; couldn't find ${quoted(missed)}.`,
  )
}

/**
 * Find the open-list option matching `value`, escalating through tiers: match the
 * already-rendered list; if absent and the widget is searchable, type to filter and
 * re-match; if still absent and the list is virtualized, scroll and re-match.
 */
async function resolveOption(
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
  value: string,
): Promise<Element | null> {
  let hit = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
  if (hit) return hit

  // Type into the widget's filter input — resolved even when the scan didn't capture
  // it, since a search box often only exists once the list is open. This surfaces
  // JS-filtered, typeahead-only, and async-fetched options.
  const input = resolveSearchInput(widget, widgetEl, doc)
  if (input) {
    focusEl(input)
    setNativeValue(input, value)
    dispatchKey(input, 'keydown')
    dispatch(input, 'input')
    dispatchKey(input, 'keyup')
    // Bounded poll: JS filtering (and any async fetch) may resolve over a few ticks.
    for (let i = 0; i < 3 && !hit; i++) {
      await settle()
      hit = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
    }
    if (hit) return hit
  }

  if (widget.isVirtualized) {
    hit = await scrollAndMatch(widget, widgetEl, trigger, doc, value)
  }
  return hit
}

/** The widget's filter input: the scan-time selector if it resolves, else a text/search input in the open panel. */
function resolveSearchInput(
  widget: CustomWidget,
  widgetEl: Element,
  doc: Document,
): Fillable | null {
  if (widget.searchInputSelector) {
    const byScan =
      queryIn(widgetEl, widget.searchInputSelector) ?? queryIn(doc, widget.searchInputSelector)
    if (byScan) return byScan as Fillable
  }
  const linked = widget.listboxId ? doc.getElementById(widget.listboxId) : null
  const found =
    (linked && queryIn(linked, 'input[type="search"], input[type="text"], input:not([type])')) ??
    queryIn(widgetEl, 'input[type="search"], input[type="text"], input:not([type])')
  return (found as Fillable | null) ?? null
}

/** Known virtual-scroller markers, used to find the scrollable list container. */
const VIRTUAL_SCROLLER_SELECTOR =
  '.rc-virtual-list-holder, .cdk-virtual-scroll-viewport, [class*="virtual" i]'

/**
 * Scroll a virtualized list a window at a time, re-matching after each step, so an
 * option that only mounts when visible can still be found. Bounded, and a no-op
 * without real layout (jsdom reports clientHeight 0) so unit tests skip it.
 */
async function scrollAndMatch(
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
  value: string,
): Promise<Element | null> {
  const nodes = openOptionNodes(widget, widgetEl, trigger, doc)
  const container = ((widget.listboxId ? doc.getElementById(widget.listboxId) : null) ??
    nodes[0]?.closest(VIRTUAL_SCROLLER_SELECTOR) ??
    nodes[0]?.parentElement ??
    null) as HTMLElement | null
  if (!container || container.clientHeight === 0) return null
  let last = -1
  for (let i = 0; i < 20; i++) {
    const hit = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
    if (hit) return hit
    if (container.scrollTop === last) break
    last = container.scrollTop
    container.scrollTop += container.clientHeight
    await settle()
  }
  return matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
}

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

/** ARIA option roles, safe to resolve document-wide (open lists are often portaled). */
const ARIA_OPTION_SELECTORS = [
  '[role="option"]',
  '[role="menuitemcheckbox"], [role="menuitemradio"]',
  '[role="button"][aria-label*="option" i]',
]

/**
 * Option nodes in the now-open list. Tries the widget's stored selector and the ARIA
 * option roles first (in the aria-controls listbox / widget / whole document, since
 * lists are often portaled to <body>); then falls back to STRUCTURAL options scoped
 * to the widget only — list items, or rows wrapping a single checkbox/radio — because
 * many real dropdowns expose no ARIA at all, just `<li>`/checkbox rows whose text is
 * the value. The trigger and empty rows are always excluded.
 */
function openOptionNodes(
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
): Element[] {
  const linked = widget.listboxId ? doc.getElementById(widget.listboxId) : null
  const ariaScopes = [linked, widgetEl, doc].filter((s) => s !== null) as ParentNode[]
  for (const selector of [widget.optionItemSelector, ...ARIA_OPTION_SELECTORS]) {
    for (const scope of ariaScopes) {
      const nodes = queryOptions(scope, selector, trigger)
      if (nodes.length) return nodes
    }
  }
  // Structural fallback — scope to the widget / linked panel ONLY (never document-wide,
  // or unrelated page lists would match).
  for (const scope of [linked, widgetEl].filter((s) => s !== null) as ParentNode[]) {
    const rows = structuralOptions(scope, trigger)
    if (rows.length) return rows
  }
  return []
}

function queryOptions(scope: ParentNode, selector: string, trigger: Element): Element[] {
  let nodes: Element[]
  try {
    nodes = Array.from(scope.querySelectorAll(selector))
  } catch {
    return []
  }
  return nodes.filter(
    (n) => n !== trigger && !trigger.contains(n) && !n.contains(trigger) && textOf(n) !== '',
  )
}

/**
 * ARIA-less options: list items in a list, or rows that each wrap a single
 * checkbox/radio (a multi-select / radio list). The row's text is its value.
 */
function structuralOptions(scope: ParentNode, trigger: Element): Element[] {
  const listItems = queryOptions(
    scope,
    'ul > li, ol > li, [role="listbox"] > li, [role="list"] > li',
    trigger,
  )
  if (listItems.length) return listItems
  let inputs: Element[]
  try {
    inputs = Array.from(scope.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
  } catch {
    return []
  }
  const rows = new Set<Element>()
  for (const input of inputs) {
    const row = optionRowFor(input)
    if (row && row !== trigger && !trigger.contains(row) && textOf(row) !== '') rows.add(row)
  }
  return Array.from(rows)
}

/** The selectable row wrapping a checkbox/radio: its list item, else a labelled ancestor. */
function optionRowFor(input: Element): Element | null {
  const li = input.closest('li')
  if (li) return li
  let node = input.parentElement
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    if (node.querySelector('label') || textOf(node) !== '') return node
  }
  return input.parentElement
}

/** Whether this widget lets several options be chosen at once (so we fill a token list). */
function isMultiSelect(
  widget: CustomWidget,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
): boolean {
  if (widget.kind === 'multiselect') return true
  const linked = widget.listboxId ? doc.getElementById(widget.listboxId) : null
  if (
    widgetEl.querySelector('[aria-multiselectable="true"]') !== null ||
    linked?.getAttribute('aria-multiselectable') === 'true'
  ) {
    return true
  }
  // Options that each carry a checkbox are inherently multi-select.
  return openOptionNodes(widget, widgetEl, trigger, doc).some(
    (n) => n.querySelector('input[type="checkbox"]') !== null,
  )
}

/** The display label of an option: its inner `<label>`, else its text, else aria-label. */
function optionLabelText(option: Element): string {
  const label = option.querySelector('label')
  const labelText = label ? textOf(label) : ''
  return labelText || textOf(option) || option.getAttribute('aria-label')?.trim() || ''
}

/** Whether an option currently reads as selected: a checked inner box, aria, or class. */
function optionIsSelected(option: Element): boolean {
  const box = option.querySelector('input[type="checkbox"], input[type="radio"]')
  if (box && (box as HTMLInputElement).checked) return true
  return (
    option.getAttribute('aria-selected') === 'true' ||
    option.getAttribute('aria-checked') === 'true' ||
    /(^|[\s_-])(selected|checked|active)([\s_-]|$)/i.test(option.getAttribute('class') ?? '')
  )
}

/**
 * The option whose accessible name best matches `value`. Tries each option's
 * visible text, `aria-label` (only when it discriminates between options — many
 * widgets stamp every option with the SAME generic label like "Select option", so
 * the real value is the text), `title`, and any automation/value attribute. Tiers,
 * best wins: automation-attribute handle → exact name → contains (either way) → prefix.
 */
function matchOption(nodes: Element[], widget: CustomWidget, value: string): Element | null {
  const want = norm(value)
  if (!want || nodes.length === 0) return null
  const ariaLabels = nodes.map((n) => n.getAttribute('aria-label')?.trim() ?? '')
  const ariaDiscriminates = new Set(ariaLabels.filter(Boolean)).size > 1
  let bestNode: Element | null = null
  let bestTier = Infinity
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.getAttribute('aria-disabled') === 'true') continue
    const tier = optionTier(node, widget, want, ariaDiscriminates ? ariaLabels[i] : '')
    if (tier > 0 && tier < bestTier) {
      bestTier = tier
      bestNode = node
    }
  }
  return bestNode
}

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

/**
 * Click an option, anchoring the press to the in-drawer trigger when the option is
 * portaled OUTSIDE the scoped root — so a coordinate-based outside-dismiss layer
 * reads the press as inside the panel and leaves the drawer open.
 */
function clickOption(option: Element, trigger: Element, root: FillRoot): void {
  const target = optionClickTarget(option)
  clickElement(target, withinRoot(root, target) ? target : trigger)
}

/**
 * The element to actually press for an option. Prefers an inner interactive node so a
 * click handler bound to a child fires (events still bubble to ancestor handlers
 * either way), falling back to the option row itself.
 */
function optionClickTarget(option: Element): Element {
  return (
    option.querySelector(
      '[role="option"], [role="button"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ) ??
    option.querySelector('label') ??
    option.querySelector('[class*="cursor-pointer" i]') ??
    option
  )
}

/** Whether a pick committed: the display changed, now matches the option, or it reports selected. */
function selectionLanded(
  widgetEl: Element,
  widget: CustomWidget,
  doc: Document,
  previous: string,
  chosenLabel: string,
  option: Element,
): boolean {
  const got = readDisplay(widgetEl, widget, doc)
  if (norm(got) !== norm(previous) || norm(got) === norm(chosenLabel)) return true
  return optionIsSelected(option)
}

/**
 * Drive selection from the keyboard when a click won't commit: step ArrowDown until
 * the trigger's aria-activedescendant points at the target option (or it reports
 * selected), then press Enter. Covers both ARIA focus models (roving tabindex and
 * aria-activedescendant). Bounded; verification is left to the caller.
 */
function selectByKeyboard(trigger: Element, option: Element): void {
  const id = option.getAttribute('id')
  focusEl(trigger as Fillable)
  const reached = (): boolean =>
    (!!id && trigger.getAttribute('aria-activedescendant') === id) ||
    option.getAttribute('aria-selected') === 'true'
  for (let i = 0; i < 50 && !reached(); i++) {
    dispatchKey(trigger, 'keydown', 'ArrowDown')
    if (!id) break // no id to track — one step, then commit and let the caller verify
  }
  dispatchKey(trigger, 'keydown', 'Enter')
}

// --- Datepicker -----------------------------------------------------------

interface TargetDate {
  year: number
  /** 0-based, to align with Date#getMonth. */
  month: number
  day: number
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

/**
 * Fill a calendar widget. Prefers typing the date into an editable input; otherwise
 * opens the calendar, navigates to the target month, and clicks the day cell. Falls
 * back to `assisted` when the date can't be parsed or the month can't be reached.
 */
async function fillDatePicker(
  ins: FillInstruction,
  widgetEl: Element,
  trigger: Element,
  root: FillRoot,
  doc: Document,
): Promise<FillResult> {
  const date = parseDate(ins.proposedValue)
  if (!date) {
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Couldn't read "${ins.proposedValue}" as a date.`,
    )
  }

  // Editable input → type the value (the simplest reliable path when allowed).
  const input = queryIn(widgetEl, 'input') as HTMLInputElement | null
  if (input && !isReadonly(input) && !isDisabled(input)) {
    setValue(input, ins.proposedValue)
    await settle()
    const got = readValue(input)
    if (norm(got) !== '') return success(ins.detectedFieldId, got)
  }

  clickElement(trigger)
  await settle()
  const cell = await navigateCalendar(widgetEl, doc, date, root, trigger)
  if (!cell) {
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Open the calendar and pick ${ins.proposedValue}.`,
    )
  }
  // Some pickers need an explicit Apply (e.g. @vuepic without auto-apply).
  const apply = queryIn(doc, '.dp__action_select, [data-test="apply"], button[type="submit"]')
  if (apply) {
    clickElement(apply)
    await settle()
  }
  return success(ins.detectedFieldId, ins.proposedValue)
}

/**
 * Page the open calendar to the target month/year, then click its day cell. Returns
 * the clicked cell, or null when the month can't be reached or the day isn't found.
 */
async function navigateCalendar(
  widgetEl: Element,
  doc: Document,
  date: TargetDate,
  root: FillRoot,
  trigger: Element,
): Promise<Element | null> {
  for (let i = 0; i < 24; i++) {
    const heading = calendarHeading(doc, widgetEl)
    if (heading !== null && headingMatches(heading, date)) break
    const nav = navButton(doc, widgetEl, heading, date)
    if (!nav) break
    clickOption(nav, trigger, root)
    await settle()
  }
  const cell = dayCell(doc, widgetEl, date)
  if (!cell) return null
  clickOption(cell, trigger, root)
  await settle()
  return cell
}

/** Text of the calendar's month/year header, or null. */
function calendarHeading(doc: Document, widgetEl: Element): string | null {
  const sel =
    '[class*="header" i] [class*="title" i], [class*="month" i][class*="year" i], ' +
    '[aria-live], .dp__month_year_wrap, .mat-calendar-period-button, [role="grid"]'
  const el = queryIn(widgetEl, sel) ?? queryIn(doc, sel)
  if (!el) return null
  return el.getAttribute('aria-label') || textOf(el) || null
}

/** Whether a header string names the target month and year. */
function headingMatches(heading: string, date: TargetDate): boolean {
  const h = norm(heading)
  return h.includes(MONTH_NAMES[date.month]) && h.includes(String(date.year))
}

/**
 * The previous/next-month button to step toward the target. Direction is chosen
 * from the current heading when it can be read, else defaults to "next".
 */
function navButton(
  doc: Document,
  widgetEl: Element,
  heading: string | null,
  date: TargetDate,
): Element | null {
  const goBack = heading !== null && headingIsAfter(heading, date)
  const forward =
    '[aria-label*="next" i], [class*="next" i], .dp__inner_nav_next, button[class*="next" i]'
  const backward =
    '[aria-label*="prev" i], [aria-label*="previous" i], [class*="prev" i], .dp__inner_nav, button[class*="prev" i]'
  const sel = goBack ? backward : forward
  return queryIn(widgetEl, sel) ?? queryIn(doc, sel)
}

/** Whether the displayed month/year is later than the target (so we must page back). */
function headingIsAfter(heading: string, date: TargetDate): boolean {
  const h = norm(heading)
  const year = Number((/\b(\d{4})\b/.exec(h) ?? [])[1])
  const month = MONTH_NAMES.findIndex((m) => h.includes(m))
  if (!Number.isFinite(year) || month < 0) return false
  return year > date.year || (year === date.year && month > date.month)
}

/** The day cell for the target date: matched by full-date aria-label, else day-number text. */
function dayCell(doc: Document, widgetEl: Element, date: TargetDate): Element | null {
  const sel =
    '[role="gridcell"], .dp__cell_inner, .mat-calendar-body-cell, td[role] button, [class*="day" i]'
  const scope: ParentNode = (widgetEl.querySelector(sel) ? widgetEl : doc) as ParentNode
  let cells: Element[]
  try {
    cells = Array.from(scope.querySelectorAll(sel))
  } catch {
    return null
  }
  const day = String(date.day)
  const monthName = MONTH_NAMES[date.month]
  // Prefer an unambiguous full-date aria-label.
  const byLabel = cells.find((c) => {
    if (isDayDisabled(c)) return false
    const label = norm(c.getAttribute('aria-label') ?? '')
    return (
      label !== '' &&
      label.includes(monthName) &&
      label.includes(String(date.year)) &&
      new RegExp(`\\b${day}\\b`).test(label)
    )
  })
  if (byLabel) return byLabel
  // Fall back to the day number, skipping disabled / adjacent-month cells.
  return (
    cells.find((c) => !isDayDisabled(c) && !isAdjacentMonth(c) && norm(textOf(c)) === day) ?? null
  )
}

function isDayDisabled(cell: Element): boolean {
  return (
    cell.getAttribute('aria-disabled') === 'true' ||
    (cell as HTMLButtonElement).disabled === true ||
    /disabled/i.test(cell.getAttribute('class') ?? '')
  )
}

function isAdjacentMonth(cell: Element): boolean {
  return /(other|adjacent|outside|offset|sibling)[-_]?month|dp__cell_offset/i.test(
    cell.getAttribute('class') ?? '',
  )
}

/** Parse common date formats to a target Y/M/D, or null when unrecognized. */
function parseDate(value: string): TargetDate | null {
  const t = value.trim()
  if (!t) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t) // ISO 8601 YYYY-MM-DD
  if (m) return { year: +m[1], month: +m[2] - 1, day: +m[3] }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t) // US M/D/Y
  if (m) {
    const year = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    return { year, month: +m[1] - 1, day: +m[2] }
  }
  const parsed = new Date(t) // free-text fallback (e.g. "May 15, 2026")
  if (!Number.isNaN(parsed.getTime())) {
    return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() }
  }
  return null
}

async function undoCustomSelect(
  entry: UndoEntry,
  widget: CustomWidget,
  root: FillRoot,
): Promise<FillResult> {
  const prev = entry.previousDisplayText
  if (!prev) {
    return skip(entry.detectedFieldId, "Couldn't auto-undo this dropdown — reset it manually.")
  }
  const widgetEl = findElement(
    root,
    markedSelectors(entry.detectedFieldId, entry.selectorCandidates),
  )
  if (!widgetEl) return skip(entry.detectedFieldId, 'Element not found on the page.')

  const doc = ownerDocOf(widgetEl)
  const trigger = findElement(root, widget.triggerSelectorCandidates) ?? widgetEl
  clickElement(trigger)
  await settle()
  const option = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, prev)
  if (!option) {
    return skip(entry.detectedFieldId, `Couldn't restore previous selection "${prev}".`)
  }
  clickOption(option, trigger, root)
  await settle()
  return success(entry.detectedFieldId, prev)
}

function readDisplay(widgetEl: Element, widget: CustomWidget, doc: Document): string {
  for (const sel of widget.valueDisplaySelectorCandidates) {
    const m = queryIn(widgetEl, sel) ?? queryIn(doc, sel)
    if (m) return displayValue(m)
  }
  const trigger = findElement(doc, widget.triggerSelectorCandidates)
  return displayValue(trigger ?? widgetEl)
}

/**
 * The value a custom widget is currently showing. Searchable comboboxes (e.g. a
 * React country picker) keep the chosen value in a typeahead `<input>` and render
 * a hint as sibling text — so a non-empty contained form control wins. Falls back
 * to text content for widgets that render the selection as plain text (e.g. a
 * `<div>` holding the label). Without this, a successful pick whose value lives in
 * an input reads as "" and verification false-negatives the fill.
 */
function displayValue(el: Element): string {
  const control = (
    el.matches('input, textarea, select') ? el : el.querySelector('input, textarea, select')
  ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  const value = control?.value.replace(/\s+/g, ' ').trim()
  if (value) return value
  return textOf(el)
}

function queryIn(scope: ParentNode, selector: string): Element | null {
  try {
    return scope.querySelector(selector)
  } catch {
    return null
  }
}

/** Text content minus SVG/icon noise, whitespace-collapsed. */
function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element
  for (const svg of Array.from(clone.querySelectorAll('svg'))) svg.remove()
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Click an element the way a user would: a faithful pointer + mouse sequence at
 * the element's on-screen center, then a native click + focus.
 *
 * The coordinates and PointerEvent identity are load-bearing, not cosmetic. We
 * only click-drive custom selects, which usually live inside a drawer/dialog,
 * and modern drawer layers (Vaul, Radix, Reka) decide "press inside vs. outside"
 * from event geometry and pointer identity. A coordinate-less press reports
 * clientX/clientY = 0 — the viewport's top-left corner, outside the panel — so
 * those layers treat the fill as an outside click and tear the drawer down
 * mid-fill, even on the in-drawer trigger click that opens the dropdown. Sending
 * a real PointerEvent at the element's center makes the press read as inside.
 */
function clickElement(el: Element, anchor: Element = el): void {
  // Events fire on `el`; the press COORDINATES come from `anchor`. They differ only
  // when `el` is portaled outside the drawer — then `anchor` is an in-drawer node so
  // the geometry reads as inside (see fillCustomSelect). Same element by default.
  const { x, y } = pointerCenter(anchor)
  el.dispatchEvent(pointerEvent('pointerdown', x, y, 1))
  el.dispatchEvent(mouseEvent('mousedown', x, y, 1))
  el.dispatchEvent(pointerEvent('pointerup', x, y, 0))
  el.dispatchEvent(mouseEvent('mouseup', x, y, 0))
  // Dispatch the click WITH the press coordinates — NOT HTMLElement.click(), which
  // is coordinate-less (clientX/clientY = 0 → the viewport's top-left corner,
  // OUTSIDE a right-anchored drawer). A modal that decides "inside vs outside" from
  // the CLICK event's geometry (not just pointerdown) would otherwise read our
  // in-drawer trigger press as an outside click and dismiss the drawer ~mid-fill.
  el.dispatchEvent(mouseEvent('click', x, y, 0))
  const node = el as HTMLElement
  if (typeof node.focus === 'function') {
    try {
      node.focus()
    } catch {
      /* focus can throw on detached nodes */
    }
  }
}

/**
 * The on-screen center of an element, used as synthetic-press coordinates.
 * Falls back to (0,0) only for a detached or zero-box node (or an environment
 * without layout, e.g. jsdom) — on a real page the rect is real.
 */
function pointerCenter(el: Element): { x: number; y: number } {
  try {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  } catch {
    return { x: 0, y: 0 }
  }
}

function mouseEvent(type: string, x = 0, y = 0, buttons = 0): Event {
  try {
    return new MouseEvent(type, pointerInit(x, y, buttons))
  } catch {
    return new Event(type, { bubbles: true, cancelable: true })
  }
}

function pointerEvent(type: string, x: number, y: number, buttons: number): Event {
  try {
    return new PointerEvent(type, {
      ...pointerInit(x, y, buttons),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
    })
  } catch {
    // Engines without a PointerEvent constructor: a same-typed mouse event still
    // carries the coordinates that outside-dismiss logic reads.
    return mouseEvent(type, x, y, buttons)
  }
}

/**
 * Shared init for synthetic presses. Deliberately omits `view`: a content script
 * and the page are different realms, so passing the page's window to the event
 * constructor fails its "view must be a Window" brand check and throws — which is
 * exactly what used to drop these to coordinate-less plain Events. `view` is not
 * needed for the geometry or pointer identity that dismiss layers read.
 */
function pointerInit(x: number, y: number, buttons: number): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons,
  }
}

/** Yield a macrotask so framework state updates flush before we verify. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// --- DOM primitives -------------------------------------------------------

function isToggle(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'input') return false
  const t = (el as HTMLInputElement).type.toLowerCase()
  return t === 'checkbox' || t === 'radio'
}

function isDisabled(el: Fillable): boolean {
  return el.hasAttribute('disabled') || (el as HTMLInputElement).disabled === true
}
function isReadonly(el: Fillable): boolean {
  return el.hasAttribute('readonly') || (el as HTMLInputElement).readOnly === true
}

function readValue(el: Fillable): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return (el as HTMLInputElement).value ?? ''
  }
  return el.textContent ?? ''
}

/**
 * Set a value using the prototype's native setter so framework-controlled
 * (React/Vue) inputs notice the change, then dispatch input/change/blur.
 */
function setValue(el: Fillable, value: string): void {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    setNativeValue(el, value)
  } else {
    el.textContent = value
  }
  dispatch(el, 'input')
  dispatch(el, 'change')
  dispatch(el, 'blur')
}

function setChecked(el: HTMLInputElement, checked: boolean): void {
  el.checked = checked
  dispatch(el, 'input')
  dispatch(el, 'change')
}

function setNativeValue(el: Fillable, value: string): void {
  const proto = Object.getPrototypeOf(el) as object
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) descriptor.set.call(el, value)
  else (el as HTMLInputElement).value = value
}

function dispatch(el: Element, type: 'input' | 'change' | 'blur'): void {
  el.dispatchEvent(new Event(type, { bubbles: true }))
}

/**
 * Prepend the scanner's stable per-element marker so resolution hits the exact
 * element that was detected. The marker is derived from the field id (the scanner
 * stamps `data-qf-id="<id>"`), never persisted into saved mappings — so it can't
 * pollute cross-scan matching. Falls back to the fuzzy candidates if the marker is
 * gone (e.g. the framework re-rendered the node between scan and fill).
 */
function markedSelectors(detectedFieldId: string, candidates: string[]): string[] {
  return [`[data-qf-id="${detectedFieldId}"]`, ...candidates]
}

/**
 * First element matching any selector candidate, searched across open shadow roots
 * AND same-origin iframes. Skips elements already claimed by an earlier instruction
 * in the same batch, so a non-unique fuzzy selector can never double-target one
 * element.
 */
function findElement(root: FillRoot, selectors: string[], claimed?: Set<Element>): Fillable | null {
  for (const selector of selectors) {
    const found = deepQuery(root, selector, claimed)
    if (found) return found
  }
  return null
}

/** The same-origin document of an iframe, or null when it's cross-origin/absent. */
function frameDocument(el: Element): Document | null {
  if (el.tagName.toLowerCase() !== 'iframe') return null
  try {
    return (el as HTMLIFrameElement).contentDocument ?? null
  } catch {
    return null // cross-origin — not accessible
  }
}

function deepQuery(root: FillRoot, selector: string, claimed?: Set<Element>): Fillable | null {
  let matches: Element[]
  try {
    matches = Array.from(root.querySelectorAll(selector))
  } catch {
    matches = [] // invalid/structural selector — skip
  }
  for (const match of matches) {
    if (!claimed?.has(match)) return match as Fillable
  }

  // Descend into open shadow roots and same-origin iframes. The scanner stamps
  // its data-qf-id marker (and detects fields) inside both, so the filler must
  // resolve into both — otherwise a field scanned in an iframe is never filled.
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) {
      const inner = deepQuery(shadow, selector, claimed)
      if (inner) return inner
    }
    const frameDoc = frameDocument(el)
    if (frameDoc) {
      const inner = deepQuery(frameDoc, selector, claimed)
      if (inner) return inner
    }
  }
  return null
}

const success = (detectedFieldId: string, acceptedValue: string | null): FillResult => ({
  detectedFieldId,
  status: 'success',
  acceptedValue,
})
const skip = (detectedFieldId: string, reason: string): FillResult => ({
  detectedFieldId,
  status: 'skipped',
  reason,
})
const fail = (detectedFieldId: string, reason: string): FillResult => ({
  detectedFieldId,
  status: 'failed',
  reason,
})
const assisted = (detectedFieldId: string, acceptedValue: string, reason: string): FillResult => ({
  detectedFieldId,
  status: 'assisted',
  acceptedValue,
  reason,
})
