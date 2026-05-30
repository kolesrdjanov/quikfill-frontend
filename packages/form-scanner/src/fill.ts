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
  root: Document = document,
): Promise<FillOutcome> {
  const results: FillResult[] = []
  const entries: UndoEntry[] = []
  // Elements already written this batch — never targeted twice (a later field's
  // value must not overwrite an earlier field's element via a shared selector).
  const claimed = new Set<Element>()

  // Assisted-autocomplete fields go last: typing focuses the input and opens its
  // suggestion dropdown, and we want that dropdown left open — so no later field
  // write steals focus away from it.
  const ordered = [
    ...instructions.filter((i) => i.fillStrategy !== 'assistedAutocomplete'),
    ...instructions.filter((i) => i.fillStrategy === 'assistedAutocomplete'),
  ]

  for (const ins of ordered) {
    // No value to write (unknown field, AI-draft stub, missing generator) — skip
    // rather than write "" and falsely report success. Toggles and custom selects
    // are exempt: an empty value on a toggle is a meaningful "unchecked", and a
    // custom select fills by clicking its first option, so it has nothing to type.
    if (
      ins.fillStrategy !== 'clickToggle' &&
      ins.fillStrategy !== 'customSelect' &&
      ins.proposedValue.trim() === ''
    ) {
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
  root: Document = document,
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

function dispatchKey(el: Element, type: 'keydown' | 'keyup'): void {
  let ev: Event
  try {
    ev = new KeyboardEvent(type, { bubbles: true, key: 'Unidentified' })
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
  root: Document,
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

function undoRadioGroup(entry: UndoEntry, root: Document): FillResult {
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
function collectRadios(root: Document | ShadowRoot, selectors: string[]): HTMLInputElement[] {
  const out: HTMLInputElement[] = []
  const seen = new Set<Element>()
  for (const selector of selectors) collectRadiosInto(root, selector, out, seen)
  return out
}

function collectRadiosInto(
  root: Document | ShadowRoot,
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
 * Fill a custom (non-native) select by opening it and clicking its FIRST option.
 * Per product choice, custom selects do not value-match — they always take the
 * first available option, so `proposedValue` is intentionally ignored here. (To
 * switch to "match the proposed value, else first" later, replace the firstOption
 * call with a value lookup that falls back to firstOption.)
 */
async function fillCustomSelect(
  ins: FillInstruction,
  widget: CustomWidget,
  root: Document,
  claimed: Set<Element>,
): Promise<{ result: FillResult; entry?: UndoEntry }> {
  const widgetEl = findElement(
    root,
    markedSelectors(ins.detectedFieldId, ins.selectorCandidates),
    claimed,
  )
  if (!widgetEl) return { result: skip(ins.detectedFieldId, 'Element not found on the page.') }
  claimed.add(widgetEl)

  const trigger = findElement(root, widget.triggerSelectorCandidates) ?? widgetEl
  const previousDisplayText = readDisplay(widgetEl, widget, root)

  clickElement(trigger)
  await settle()

  // First option in the now-open list. Prefer one inside the widget; fall back to
  // the document for libraries that portal the dropdown outside the widget root.
  const option =
    firstOption(widgetEl, widget.optionItemSelector, trigger) ??
    firstOption(root, widget.optionItemSelector, trigger)
  if (!option) {
    return {
      result: fail(ins.detectedFieldId, 'Opened the dropdown but found no option to select.'),
    }
  }
  const chosenLabel = textOf(option)

  const entry: UndoEntry = {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    previousValue: null,
    previousDisplayText,
    customWidget: widget,
  }

  clickElement(option)
  await settle()

  const got = readDisplay(widgetEl, widget, root)
  // Accept if the displayed selection changed, now matches the option we clicked,
  // or the option reports itself selected — any one confirms the pick landed.
  const landed =
    norm(got) !== norm(previousDisplayText) ||
    norm(got) === norm(chosenLabel) ||
    option.getAttribute('aria-selected') === 'true'
  if (landed) {
    return { result: success(ins.detectedFieldId, chosenLabel || got || null), entry }
  }
  return {
    result: fail(
      ins.detectedFieldId,
      `Clicked the first option ("${chosenLabel}") but the dropdown still shows "${got}".`,
    ),
    entry,
  }
}

async function undoCustomSelect(
  entry: UndoEntry,
  widget: CustomWidget,
  root: Document,
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

  const trigger = findElement(root, widget.triggerSelectorCandidates) ?? widgetEl
  clickElement(trigger)
  await settle()
  const option =
    findOption(widgetEl, widget.optionItemSelector, prev) ??
    findOption(root, widget.optionItemSelector, prev)
  if (!option) {
    return skip(entry.detectedFieldId, `Couldn't restore previous selection "${prev}".`)
  }
  clickElement(option)
  await settle()
  return success(entry.detectedFieldId, prev)
}

function findOption(scope: ParentNode, selector: string, value: string): Element | null {
  let nodes: Element[]
  try {
    nodes = Array.from(scope.querySelectorAll(selector))
  } catch {
    return null
  }
  const target = norm(value)
  return nodes.find((n) => norm(textOf(n)) === target) ?? null
}

/** The first option node matching the selector, never the trigger itself. */
function firstOption(scope: ParentNode, selector: string, exclude: Element | null): Element | null {
  let nodes: Element[]
  try {
    nodes = Array.from(scope.querySelectorAll(selector))
  } catch {
    return null
  }
  for (const n of nodes) {
    if (exclude && (n === exclude || exclude.contains(n) || n.contains(exclude))) continue
    return n
  }
  return null
}

function readDisplay(widgetEl: Element, widget: CustomWidget, root: Document): string {
  for (const sel of widget.valueDisplaySelectorCandidates) {
    const m = queryIn(widgetEl, sel) ?? queryIn(root, sel)
    if (m) return displayValue(m)
  }
  const trigger = findElement(root, widget.triggerSelectorCandidates)
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

/** Click an element the way a user would: pointer + mouse sequence + native click. */
function clickElement(el: Element): void {
  const view = el.ownerDocument?.defaultView ?? undefined
  for (const type of ['pointerdown', 'mousedown', 'mouseup'] as const) {
    el.dispatchEvent(mouseEvent(type, view))
  }
  const node = el as HTMLElement
  if (typeof node.click === 'function') node.click()
  else el.dispatchEvent(mouseEvent('click', view))
  if (typeof node.focus === 'function') {
    try {
      node.focus()
    } catch {
      /* focus can throw on detached nodes */
    }
  }
}

function mouseEvent(type: string, view?: Window): Event {
  const init = { bubbles: true, cancelable: true, view }
  try {
    return new MouseEvent(type, init)
  } catch {
    return new Event(type, { bubbles: true, cancelable: true })
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
function findElement(
  root: Document | ShadowRoot,
  selectors: string[],
  claimed?: Set<Element>,
): Fillable | null {
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

function deepQuery(
  root: Document | ShadowRoot,
  selector: string,
  claimed?: Set<Element>,
): Fillable | null {
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
