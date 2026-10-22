import {
  calendarMonthYear,
  calendarFormat,
  parseCalendarDate,
  formatCalendarDate,
  type CalendarDate,
  type CalendarFormat,
} from './calendar-date'
import type {
  CustomWidget,
  DetectedField,
  FillInstruction,
  FillResult,
  UndoEntry,
  UndoSnapshot,
} from '@quikfill/schemas'
import { waitForWidget, operationActive, type WidgetOperation } from './widget-wait'
import { withoutSubmit } from './interaction-guard'
import { coerceToMask, getMaskSpec, valuesMatch } from './mask'
import { isToggle, isAriaToggle, checkedState, activateToggle, toggleValue } from './toggle-adapter'
import {
  calendarHeading,
  clickElement,
  dayCellNodes,
  dispatchKey,
  findElement,
  focusEl,
  frameDocument,
  isAdjacentMonth,
  isDayDisabled,
  markedSelectors,
  norm,
  openOptionNodes,
  observeWidgetPopup,
  optionAutomationValues,
  optionLabelText,
  ownerDocOf,
  queryIn,
  resolveTrigger,
  settle,
  textOf,
  widgetPopupRoots,
  looksLikeCalendar,
  type Fillable,
  type FillRoot,
} from './widget-dom'

export interface FillOutcome {
  results: FillResult[]
  undoSnapshot: UndoSnapshot
}

export interface FillTarget {
  element: Fillable
  value: string
  checked?: boolean
}

export interface FillOptions {
  signal?: AbortSignal
  isCurrent?: () => boolean
  /** Bound before asynchronous work; never retarget a replacement control. */
  targets?: ReadonlyMap<string, FillTarget>
}

export function captureFillTargets(
  fields: DetectedField[],
  root: FillRoot = document,
  bindings?: ReadonlyMap<string, FillTarget>,
): Map<string, FillTarget> {
  const targets = new Map<string, FillTarget>()
  for (const field of fields) {
    const el = bindings
      ? bindings.get(field.id)?.element
      : findElement(root, markedSelectors(field.id, field.selectorCandidates))
    if (!el || !el.isConnected || !withinRoot(root, el)) continue
    targets.set(field.id, {
      element: el,
      value: fieldState(field, el, root),
      checked: isToggle(el) && field.inputType !== 'radiogroup' ? checkedState(el) : undefined,
    })
  }
  return targets
}

function fieldState(
  field: Pick<FillInstruction, 'inputType' | 'customWidget' | 'selectorCandidates'>,
  el: Fillable,
  root: FillRoot,
): string {
  if (field.inputType === 'radiogroup') {
    const selected = ownedRadios(root, field.selectorCandidates, el).find(checkedState)
    return selected ? toggleValue(selected) : ''
  }
  return field.customWidget ? readDisplay(el, field.customWidget, ownerDocOf(el)) : readValue(el)
}

export type { FillRoot } from './widget-dom'

/**
 * Whether a node lives within the scoped root. A Document/ShadowRoot root keeps the
 * old whole-page behavior; an Element root scopes to its subtree. Uses nodeType +
 * `contains` (not `instanceof`) because the page and the content script are
 * different realms, so the page's Element fails the script's `instanceof Element`.
 */
function withinRoot(root: FillRoot, node: Node): boolean {
  let current: Node | null = node
  while (current) {
    if (root === current || root.contains(current)) return true
    const tree = current.getRootNode() as Document | ShadowRoot
    if ('host' in tree) current = tree.host
    else {
      try {
        current = tree.defaultView?.frameElement ?? null
      } catch {
        return false
      }
    }
  }
  return false
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
  options: FillOptions = {},
): Promise<FillOutcome> {
  return withoutSubmit(root, () => executeFill(instructions, root, options))
}

async function executeFill(
  instructions: FillInstruction[],
  root: FillRoot,
  options: FillOptions,
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
    if (
      options.signal?.aborted ||
      options.isCurrent?.() === false ||
      (root.nodeType === 1 && !root.isConnected)
    ) {
      results.push(skip(ins.detectedFieldId, 'Fill cancelled — the form is no longer active.'))
      continue
    }
    const bound = options.targets?.get(ins.detectedFieldId)
    if (options.targets) {
      if (!bound || !bound.element.isConnected || !withinRoot(root, bound.element)) {
        results.push(skip(ins.detectedFieldId, 'The original field was removed or replaced.'))
        continue
      }
      if (
        fieldState(ins, bound.element, root) !== bound.value ||
        (bound.checked !== undefined && checkedState(bound.element) !== bound.checked)
      ) {
        results.push(
          skip(ins.detectedFieldId, 'Field changed since scanning — your edit was preserved.'),
        )
        continue
      }
    }
    // No value to write (unknown field, AI-draft stub, missing generator) — skip
    // rather than write "" and falsely report success. Toggles are exempt: an empty
    // value on a toggle is a meaningful "unchecked". A custom select with no proposed
    // value is left untouched too — we never auto-pick its first option (that silently
    // selected garbage, e.g. "United States" on a country list).
    if (
      ins.fillStrategy !== 'clickToggle' &&
      ins.proposedValue.trim() === '' &&
      ins.expectedValidity !== 'invalid'
    ) {
      results.push(skip(ins.detectedFieldId, 'Nothing to fill — no value was proposed.'))
      continue
    }

    if (
      ins.expectedValidity === 'invalid' &&
      (ins.customWidget ||
        ins.inputType === 'radiogroup' ||
        ins.fillStrategy === 'assistedAutocomplete')
    ) {
      results.push(
        skip(ins.detectedFieldId, 'Expected-invalid case is unsupported by this widget adapter.'),
      )
      continue
    }

    if (ins.fillStrategy === 'customSelect' && ins.customWidget) {
      try {
        let edited = false
        const element =
          bound?.element ??
          findElement(root, markedSelectors(ins.detectedFieldId, ins.selectorCandidates))
        const doc = element ? ownerDocOf(element) : null
        const onUserEdit = (event: Event): void => {
          if (
            event.isTrusted &&
            element &&
            (element.contains(event.target as Node) ||
              widgetPopupRoots(ins.customWidget!, element, resolveTrigger(element), doc!).some(
                (r) => r.contains(event.target as Node),
              ))
          )
            edited = true
        }
        for (const type of ['input', 'change', 'pointerdown'])
          doc?.addEventListener(type, onUserEdit, true)
        const guarded = { ...options, isCurrent: () => !edited && options.isCurrent?.() !== false }
        let outcome: Awaited<ReturnType<typeof fillCustomSelect>>
        try {
          outcome = await fillCustomSelect(
            ins,
            ins.customWidget,
            root,
            claimed,
            bound?.element,
            guarded,
          )
        } finally {
          for (const type of ['input', 'change', 'pointerdown'])
            doc?.removeEventListener(type, onUserEdit, true)
        }
        const { result, entry } = outcome
        results.push(result)
        if (
          operationActive(guarded) &&
          entry?.appliedDisplayText !== undefined &&
          (entry.appliedDisplayText !== entry.previousDisplayText ||
            JSON.stringify(entry.previousSelectedValues) !==
              JSON.stringify(entry.appliedSelectedValues))
        )
          entries.push(entry)
      } catch (error) {
        results.push(
          fail(
            ins.detectedFieldId,
            error instanceof Error ? error.message : 'Widget interaction failed.',
          ),
        )
      }
      continue
    }

    if (ins.inputType === 'radiogroup') {
      const { result, entry } = await fillRadioGroup(ins, root, claimed, bound?.element)
      results.push(result)
      if (entry && entry.previousValue !== entry.appliedValue) entries.push(entry)
      continue
    }

    const el =
      bound?.element ??
      findElement(root, markedSelectors(ins.detectedFieldId, ins.selectorCandidates), claimed)
    if (!el) {
      results.push(skip(ins.detectedFieldId, 'Element not found on the page.'))
      continue
    }
    claimed.add(el)
    if (isDisabled(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is disabled.'))
      continue
    }
    if (isReadonly(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is read-only.'))
      continue
    }

    const entry = capture(ins, el)

    try {
      results.push(
        ins.fillStrategy === 'assistedAutocomplete'
          ? assistAutocomplete(ins, el)
          : await writeAndVerify(ins, el),
      )
    } catch (e) {
      results.push(fail(ins.detectedFieldId, e instanceof Error ? e.message : 'Fill failed.'))
    }
    entry.appliedValue = readValue(el)
    entry.appliedChecked = isToggle(el) ? checkedState(el) : undefined
    if (
      entry.previousValue !== entry.appliedValue ||
      entry.previousChecked !== entry.appliedChecked
    ) {
      entries.push(entry)
    }
  }

  return { results, undoSnapshot: { entries, capturedAt: new Date().toISOString() } }
}

/** Restore the values captured in a snapshot (undo the most recent fill). */
export async function applyUndo(
  snapshot: UndoSnapshot,
  root: FillRoot = document,
  options: FillOptions = {},
): Promise<FillResult[]> {
  return withoutSubmit(root, () => executeUndo(snapshot, root, options))
}

async function executeUndo(
  snapshot: UndoSnapshot,
  root: FillRoot,
  options: FillOptions,
): Promise<FillResult[]> {
  const results: FillResult[] = []
  for (const entry of snapshot.entries) {
    const bound = options.targets?.get(entry.detectedFieldId)
    const el =
      bound?.element ??
      (options.targets
        ? null
        : findElement(root, markedSelectors(entry.detectedFieldId, entry.selectorCandidates)))
    if (
      !el ||
      !el.isConnected ||
      !withinRoot(root, el) ||
      options.signal?.aborted ||
      options.isCurrent?.() === false
    ) {
      results.push(skip(entry.detectedFieldId, 'The original field is no longer available.'))
      continue
    }
    if (isDisabled(el) || (isReadonly(el) && !entry.customWidget)) {
      results.push(skip(entry.detectedFieldId, 'Field is now disabled or read-only.'))
      continue
    }
    const liveSelections = entry.customWidget ? selectionValues(el, entry.customWidget) : null
    const changed =
      liveSelections && entry.appliedSelectedValues
        ? JSON.stringify([...liveSelections].sort()) !==
          JSON.stringify([...entry.appliedSelectedValues].sort())
        : entry.customWidget
          ? entry.appliedDisplayText !== undefined &&
            readDisplay(el, entry.customWidget, ownerDocOf(el)) !== entry.appliedDisplayText
          : entry.inputType === 'radiogroup'
            ? entry.appliedValue !== undefined &&
              fieldState({ ...entry, inputType: 'radiogroup' }, el, root) !== entry.appliedValue
            : (entry.appliedValue !== undefined && readValue(el) !== entry.appliedValue) ||
              (entry.appliedChecked !== undefined && checkedState(el) !== entry.appliedChecked)
    if (changed) {
      results.push(
        skip(entry.detectedFieldId, 'Field changed after filling — your edit was preserved.'),
      )
      continue
    }
    if (entry.customWidget) {
      results.push(await undoCustomSelect(entry, entry.customWidget, root, el, options))
      continue
    }
    if (entry.inputType === 'radiogroup') {
      results.push(await undoRadioGroup(entry, root, el))
      continue
    }
    try {
      if (isAriaToggle(el) && entry.previousValue === 'mixed') {
        results.push(skip(entry.detectedFieldId, 'Restore the previous mixed state manually.'))
        continue
      }
      if (isToggle(el) && entry.previousChecked !== undefined) {
        setChecked(el as HTMLInputElement, entry.previousChecked)
      } else {
        setValue(el, entry.previousValue ?? '')
      }
      await settle()
      const restored =
        isToggle(el) && entry.previousChecked !== undefined
          ? checkedState(el) === entry.previousChecked
          : readValue(el) === (entry.previousValue ?? '')
      results.push(
        restored
          ? success(entry.detectedFieldId, entry.previousValue)
          : fail(entry.detectedFieldId, 'Field did not accept its previous value.'),
      )
    } catch (e) {
      results.push(fail(entry.detectedFieldId, e instanceof Error ? e.message : 'Undo failed.'))
    }
  }
  return results
}

async function writeAndVerify(ins: FillInstruction, el: Fillable): Promise<FillResult> {
  if (ins.expectedValidity === 'invalid') {
    if (!el.matches('input, textarea, select') || !(el as HTMLInputElement).willValidate)
      return skip(
        ins.detectedFieldId,
        'Expected-invalid case requires a native validation control.',
      )
    const toggle = isToggle(el)
    const desired = TRUTHY.has(ins.proposedValue.toLowerCase().trim())
    if (toggle) setChecked(el as HTMLInputElement, desired)
    else setValue(el, ins.proposedValue)
    await settle()
    const accepted = readValue(el)
    const exact = toggle ? checkedState(el) === desired : accepted === ins.proposedValue
    const invalid = el.isConnected && !isValid(el)
    return {
      detectedFieldId: ins.detectedFieldId,
      status: exact && invalid ? 'success' : 'failed',
      acceptedValue: accepted,
      expectedValidity: 'invalid',
      actualValidity: invalid ? 'invalid' : 'valid',
      reason:
        exact && invalid
          ? 'Expected invalid constraint reproduced.'
          : !exact
            ? 'The control rejected or normalized the invalid test value.'
            : 'Expected invalid, but the control reports no validation error.',
    }
  }
  if (isToggle(el)) {
    const desired = TRUTHY.has(ins.proposedValue.toLowerCase().trim())
    setChecked(el as HTMLInputElement, desired)
    await settle()
    return checkedState(el) === desired &&
      el.getAttribute('aria-checked') !== 'mixed' &&
      isValid(el)
      ? success(ins.detectedFieldId, String(desired))
      : fail(ins.detectedFieldId, 'Checkbox/radio did not accept the toggle.')
  }

  // A native <select> accepts only an option *value*, but the proposed value is
  // often a human *label* (from a saved record or AI). Resolve label → value so
  // those fills land instead of silently failing.
  if (el.tagName.toLowerCase() === 'select') {
    if ((el as HTMLSelectElement).multiple) {
      return skip(
        ins.detectedFieldId,
        'Multiple selection needs manual input — existing choices were preserved.',
      )
    }
    const value = resolveSelectOption(el as HTMLSelectElement, ins.proposedValue)
    if (value === null) {
      return fail(ins.detectedFieldId, `No option matching "${ins.proposedValue}" in the dropdown.`)
    }
    setValue(el, value)
    await settle()
    return readValue(el) === value && isValid(el)
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
  if (valuesMatch(accepted, target, spec) && isValid(el)) {
    return success(ins.detectedFieldId, accepted)
  }
  return fail(
    ins.detectedFieldId,
    isValid(el)
      ? `Value not accepted (wanted "${target}", got "${accepted}").`
      : 'The entered value does not satisfy the field validation constraints.',
  )
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

function capture(ins: FillInstruction, el: Fillable): UndoEntry {
  return {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    previousValue: readValue(el),
    previousChecked: isToggle(el) ? checkedState(el) : undefined,
  }
}

// --- Radio group (one field, N same-name radios) --------------------------

/**
 * Select the radio in a group whose value (or visible label) matches the proposed
 * value, and capture the previously-selected value for undo. The group is resolved
 * by the name selector, so every member is considered — not just the first match.
 */
async function fillRadioGroup(
  ins: FillInstruction,
  root: FillRoot,
  claimed: Set<Element>,
  anchor?: Fillable,
): Promise<{ result: FillResult; entry?: UndoEntry }> {
  const radios = ownedRadios(
    root,
    ins.selectorCandidates,
    anchor ?? findElement(root, markedSelectors(ins.detectedFieldId, ins.selectorCandidates)),
  ).filter((r) => !claimed.has(r))
  if (radios.length === 0) {
    return { result: skip(ins.detectedFieldId, 'Element not found on the page.') }
  }
  const previous = radios.find(checkedState) ?? null
  const want = norm(ins.proposedValue)
  const target =
    radios.find((r) => toggleValue(r) === ins.proposedValue) ??
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
    previousValue: previous ? toggleValue(previous) : '',
  }
  activateToggle(target, true)
  await settle()
  const selected = radios.find(checkedState)
  entry.appliedValue = selected ? toggleValue(selected) : ''
  return checkedState(target) && isValid(target)
    ? { result: success(ins.detectedFieldId, toggleValue(target)), entry }
    : { result: fail(ins.detectedFieldId, 'Radio option did not accept the selection.'), entry }
}

async function undoRadioGroup(
  entry: UndoEntry,
  root: FillRoot,
  anchor: Fillable,
): Promise<FillResult> {
  const radios = ownedRadios(root, entry.selectorCandidates, anchor)
  if (radios.length === 0) return skip(entry.detectedFieldId, 'Element not found on the page.')
  const prev = entry.previousValue ?? ''
  if (prev === '') {
    // A radio cannot be unselected through native activation. Assigning checked
    // alone would falsely restore the DOM while a controlled framework stays set.
    return skip(entry.detectedFieldId, 'A previously empty radio group must be cleared manually.')
  }
  const target = radios.find((r) => toggleValue(r) === prev)
  if (!target) return skip(entry.detectedFieldId, `Couldn't restore previous selection "${prev}".`)
  activateToggle(target, true)
  await settle()
  return checkedState(target)
    ? success(entry.detectedFieldId, prev)
    : fail(entry.detectedFieldId, 'Radio group did not accept its previous selection.')
}

/**
 * Resolve a proposed value to a `<select>` option's value: exact value, exact
 * label, then case/whitespace-insensitive label or value. Returns the option's
 * value, or null when nothing matches.
 */
function resolveSelectOption(select: HTMLSelectElement, want: string): string | null {
  const options = Array.from(select.options).filter((o) => !o.matches(':disabled'))
  const wantNorm = norm(want)
  const match =
    options.find((o) => o.value === want) ??
    options.find((o) => (o.textContent ?? '').trim() === want) ??
    options.find((o) => norm(o.textContent ?? '') === wantNorm) ??
    options.find((o) => norm(o.value) === wantNorm)
  return match ? match.value : null
}

/** A radio's visible label (wrapping `<label>` text), falling back to its value. */
function radioLabel(radio: Element): string {
  const wrap = radio.closest('label')?.textContent?.replace(/\s+/g, ' ').trim()
  return wrap || toggleValue(radio)
}

/** Every radio matching any selector, across open shadow roots and same-origin iframes. */
function collectRadios(root: FillRoot, selectors: string[]): HTMLInputElement[] {
  const out: HTMLInputElement[] = []
  const seen = new Set<Element>()
  for (const selector of selectors) collectRadiosInto(root, selector, out, seen)
  return out
}

function ownedRadios(root: FillRoot, selectors: string[], anchor: Fillable | null): Element[] {
  if (!anchor) return []
  if (anchor.getAttribute('role') === 'radiogroup')
    return Array.from(anchor.querySelectorAll('[role="radio"]')).filter(
      (r) => r.closest('[role="radiogroup"]') === anchor,
    )
  const radio = anchor as HTMLInputElement
  return collectRadios(root, selectors).filter(
    (r) =>
      r.name === radio.name && r.form === radio.form && r.getRootNode() === radio.getRootNode(),
  )
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
 * matches, returns `assisted` with the list left open rather than picking a wrong
 * option or sending a dismiss signal that would collapse the host drawer.
 */
async function fillCustomSelect(
  ins: FillInstruction,
  widget: CustomWidget,
  root: FillRoot,
  claimed: Set<Element>,
  bound?: Fillable,
  options: WidgetOperation = {},
): Promise<{ result: FillResult; entry?: UndoEntry }> {
  const widgetEl =
    bound ??
    findElement(root, markedSelectors(ins.detectedFieldId, ins.selectorCandidates), claimed)
  if (!widgetEl) return { result: skip(ins.detectedFieldId, 'Element not found on the page.') }
  if (isDisabled(widgetEl) || widgetEl.getAttribute('aria-disabled') === 'true') {
    return { result: skip(ins.detectedFieldId, 'Field is disabled.') }
  }
  claimed.add(widgetEl)

  // The widget is resolved within the scoped root, but its option list is often
  // portaled to <body> — OUTSIDE the drawer — so the open-list lookups search the
  // whole owning document, not the scoped root.
  const doc = ownerDocOf(widgetEl)
  const trigger = resolveTrigger(widgetEl)
  const operation = {
    ...options,
    isCurrent: () => widgetEl.isConnected && options.isCurrent?.() !== false,
  }
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
    const result = await fillDatePicker(ins, widgetEl, trigger, root, doc, operation)
    entry.appliedDisplayText = readDisplay(widgetEl, widget, doc)
    return { result, entry }
  }

  // The scan-time probe may have failed to close this widget (some only close on
  // selection). When the trigger says the list is ALREADY open, a press would
  // TOGGLE it closed — so skip it. Only aria-expanded is trusted here: "option
  // nodes findable in the DOM" would also match pre-rendered-but-hidden lists,
  // which DO still need the opening press.
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await observeWidgetPopup(widgetEl, doc, async () => {
      clickElement(trigger)
      await waitForWidget(
        () => openOptionNodes(widget, widgetEl, trigger, doc).length > 0,
        operation,
      )
    })
  }
  if (!operationActive(operation))
    return { result: skip(ins.detectedFieldId, 'Widget operation cancelled.'), entry }

  // Multi-select is detected from the OPEN list too (checkbox rows / aria-multiselectable),
  // not just the scan-time kind — a closed ARIA-less widget can't reveal it earlier.
  if (isMultiSelect(widget, widgetEl, trigger, doc)) {
    entry.previousSelectedValues = readSelectedValues(widgetEl, widget, trigger, doc)
    const result = await selectMultiple(ins, widget, widgetEl, trigger, root, doc, operation)
    entry.appliedSelectedValues = readSelectedValues(widgetEl, widget, trigger, doc)
    entry.appliedDisplayText = readDisplay(widgetEl, widget, doc)
    return { result, entry }
  }

  // --- Single select ---
  const option = await resolveOption(widget, widgetEl, trigger, doc, ins.proposedValue, operation)

  if (!operationActive(operation))
    return { result: skip(ins.detectedFieldId, 'Widget operation cancelled.') }
  if (!option) {
    // No match. LEAVE THE LIST OPEN — never try to close it. Confirmed against the
    // real app (2026-06-01): the host drawer collapses on ANY dismiss signal — an
    // Escape (the drawer has its own Escape-to-close), or a trigger re-press whose
    // pointerdown the app reads as an outside press and tears the drawer down a tick
    // later. The ONLY drawer-safe way to close a custom select is to actually select
    // an option (an inside-the-panel click). With nothing to select, we leave the
    // open list for the user and report assisted.
    return {
      result: assisted(
        ins.detectedFieldId,
        ins.proposedValue,
        `Couldn't find "${ins.proposedValue}" in the dropdown — it's open, pick it manually.`,
      ),
      entry,
    }
  }
  const chosenLabel = optionLabelText(option)

  if (!operationActive(operation) || !option.isConnected) {
    return { result: skip(ins.detectedFieldId, 'The widget was replaced during filling.'), entry }
  }

  clickOption(option, trigger, root)
  await settle()
  if (!operationActive(operation))
    return { result: skip(ins.detectedFieldId, 'Widget operation cancelled.') }
  entry.appliedDisplayText = readDisplay(widgetEl, widget, doc)
  if (selectionLanded(widgetEl, widget, doc, previousDisplayText, chosenLabel, option)) {
    return { result: success(ins.detectedFieldId, chosenLabel || null), entry }
  }

  // The click didn't commit — try the keyboard path (covers roving-focus and
  // aria-activedescendant widgets whose option element ignores synthetic clicks).
  if (!operationActive(operation))
    return { result: skip(ins.detectedFieldId, 'Widget operation cancelled.'), entry }
  const keyboardAttempted = await selectByKeyboard(trigger, option, operation)
  if (keyboardAttempted)
    await waitForWidget(
      () => selectionLanded(widgetEl, widget, doc, previousDisplayText, chosenLabel, option),
      operation,
    )
  entry.appliedDisplayText = readDisplay(widgetEl, widget, doc)
  if (selectionLanded(widgetEl, widget, doc, previousDisplayText, chosenLabel, option)) {
    return { result: success(ins.detectedFieldId, chosenLabel || null), entry }
  }

  // Couldn't commit the pick — leave the list open. Closing it with any dismiss
  // signal would collapse the host drawer (see the no-match branch above).
  return {
    result: fail(
      ins.detectedFieldId,
      `Clicked "${chosenLabel}" but the dropdown still shows "${readDisplay(widgetEl, widget, doc)}".`,
    ),
    entry,
  }
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
  operation: WidgetOperation = {},
): Promise<FillResult> {
  const tokens =
    ins.proposedValues ??
    ins.proposedValue
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  if (tokens.length === 0) {
    return assisted(ins.detectedFieldId, ins.proposedValue, 'No values to select.')
  }
  const landed: string[] = []
  const missed: string[] = []
  for (const [index, token] of tokens.entries()) {
    if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
    const option = await resolveOption(widget, widgetEl, trigger, doc, token, operation)
    if (!option) {
      missed.push(token)
      continue
    }
    const label = optionLabelText(option)
    if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
    if (!optionIsSelected(option) && !selectionValues(widgetEl, widget)?.includes(label))
      clickOption(option, trigger, root)
    await settle()
    const live = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, token)
    if (selectionValues(widgetEl, widget)?.includes(label) || (live && optionIsSelected(live)))
      landed.push(label)
    else missed.push(token)
    // Some multiselects collapse the list on each pick — reopen for the next token.
    if (
      index < tokens.length - 1 &&
      operationActive(operation) &&
      (trigger.getAttribute('aria-expanded') === 'false' ||
        openOptionNodes(widget, widgetEl, trigger, doc).length === 0)
    ) {
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
  operation: WidgetOperation = {},
): Promise<Element | null> {
  let hit = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
  if (hit) return hit

  // Type into the widget's filter input — resolved even when the scan didn't capture
  // it, since a search box often only exists once the list is open. This surfaces
  // JS-filtered, typeahead-only, and async-fetched options.
  const input = resolveSearchInput(widget, widgetEl, doc)
  if (!operationActive(operation)) return null
  if (input) {
    focusEl(input)
    setNativeValue(input, value)
    dispatchKey(input, 'keydown')
    dispatch(input, 'input')
    dispatchKey(input, 'keyup')
    hit = await waitForWidget(
      () => matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value),
      operation,
    )

    if (hit) return hit
  }

  if (widget.isVirtualized) {
    hit = await scrollAndMatch(widget, widgetEl, trigger, doc, value, operation)
  }
  return hit
}

/** The widget's filter input: the scan-time selector if it resolves, else a text/search input in the open panel. */
function resolveSearchInput(
  widget: CustomWidget,
  widgetEl: Element,
  doc: Document,
): Fillable | null {
  if (widgetEl.matches('input[role=combobox]')) return widgetEl as Fillable
  if (widget.searchInputSelector) {
    const byScan = widgetPopupRoots(widget, widgetEl, resolveTrigger(widgetEl), doc)
      .map((scope) => queryIn(scope, widget.searchInputSelector!))
      .find(Boolean)
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
  operation: WidgetOperation = {},
): Promise<Element | null> {
  const nodes = openOptionNodes(widget, widgetEl, trigger, doc)
  const roots = widgetPopupRoots(widget, widgetEl, trigger, doc)
  const candidates = roots.flatMap((r) => [
    r,
    ...Array.from(r.querySelectorAll('*')),
  ]) as HTMLElement[]
  const container =
    candidates.find(
      (el) =>
        el.clientHeight > 0 &&
        el.scrollHeight > el.clientHeight &&
        /auto|scroll/.test(doc.defaultView?.getComputedStyle(el).overflowY ?? ''),
    ) ?? (nodes[0]?.closest(VIRTUAL_SCROLLER_SELECTOR) as HTMLElement | null)
  if (!container || container.clientHeight === 0) return null
  let last = -1
  for (let i = 0; i < 30 && operationActive(operation); i++) {
    const hit = matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
    if (hit) return hit
    if (container.scrollTop === last) break
    last = container.scrollTop
    container.scrollTop += container.clientHeight
    container.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
  }
  return matchOption(openOptionNodes(widget, widgetEl, trigger, doc), widget, value)
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

/** Whether an option currently reads as selected: a checked inner box, aria, or class. */
function optionIsSelected(option: Element): boolean {
  const box = option.querySelector('input[type="checkbox"], input[type="radio"]')
  if (box && (box as HTMLInputElement).checked) return true
  return (
    option.getAttribute('aria-selected') === 'true' ||
    option.getAttribute('aria-checked') === 'true' ||
    option.getAttribute('data-state') === 'checked' ||
    option.getAttribute('data-state') === 'selected' ||
    /(^|[\s_-])(selected|checked)([\s_-]|$)/i.test(option.getAttribute('class') ?? '')
  )
}

/**
 * The option whose accessible name best matches `value`. Tries each option's
 * visible text, `aria-label` (only when it discriminates between options — many
 * widgets stamp every option with the SAME generic label like "Select option", so
 * the real value is the text), `title`, and any automation/value attribute. Tiers,
 * best wins: automation-attribute handle → exact name. Equal best matches are ambiguous.
 */
function matchOption(nodes: Element[], widget: CustomWidget, value: string): Element | null {
  const want = norm(value)
  if (!want || nodes.length === 0) return null
  const ariaLabels = nodes.map((n) => n.getAttribute('aria-label')?.trim() ?? '')
  const ariaDiscriminates = new Set(ariaLabels.filter(Boolean)).size > 1
  let bestNode: Element | null = null
  let bestTier = Infinity
  let ambiguous = false
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.getAttribute('aria-disabled') === 'true' || node.matches(':disabled, [data-disabled]'))
      continue
    const tier = optionTier(node, widget, want, ariaDiscriminates ? ariaLabels[i] : '')
    if (tier > 0 && tier < bestTier) {
      bestTier = tier
      bestNode = node
      ambiguous = false
    } else if (tier > 0 && tier === bestTier) {
      ambiguous = true
    }
  }
  return ambiguous ? null : bestNode
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
  if (!widgetEl.isConnected) return false
  if (
    norm(got) === norm(chosenLabel) &&
    chosenLabel.trim() !== '' &&
    (!resolveTrigger(widgetEl).matches('input') ||
      resolveTrigger(widgetEl).getAttribute('aria-expanded') !== 'true')
  )
    return true
  // A re-render may replace the option. Read selection from the live owned list,
  // never from a detached node or an unrelated display change.
  const current = option.isConnected
    ? option
    : matchOption(
        openOptionNodes(widget, widgetEl, resolveTrigger(widgetEl), doc),
        widget,
        chosenLabel,
      )
  return (
    !!current &&
    optionIsSelected(current) &&
    norm(got) === norm(chosenLabel) &&
    norm(got) !== norm(previous)
  )
}

/**
 * Drive selection from the keyboard when a click won't commit: step ArrowDown until
 * the trigger's aria-activedescendant points at the target option (or it reports
 * selected), then press Enter. Covers both ARIA focus models (roving tabindex and
 * aria-activedescendant). Bounded; verification is left to the caller.
 */
async function selectByKeyboard(
  trigger: Element,
  option: Element,
  operation: WidgetOperation,
): Promise<boolean> {
  if (!operationActive(operation) || !option.isConnected) return false
  if (option.hasAttribute('tabindex') && !trigger.hasAttribute('aria-activedescendant')) {
    focusEl(option as Fillable)
    dispatchKey(option, 'keydown', 'Enter')
    dispatchKey(option, 'keyup', 'Enter')
    return true
  }
  const id = option.getAttribute('id')
  const reached = () =>
    (!!id && trigger.getAttribute('aria-activedescendant') === id) ||
    ownerDocOf(option).activeElement === option
  focusEl(trigger as Fillable)
  for (let i = 0; i < 50 && !reached() && operationActive(operation); i++) {
    dispatchKey(trigger, 'keydown', 'ArrowDown')
    await settle()
    if (!id) break
  }
  // Never commit a different active option just because navigation exhausted its budget.
  if (!reached() || !operationActive(operation)) return false
  dispatchKey(trigger, 'keydown', 'Enter')
  dispatchKey(trigger, 'keyup', 'Enter')
  return true
}

// --- Datepicker -----------------------------------------------------------

type TargetDate = CalendarDate

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
  operation: WidgetOperation = {},
): Promise<FillResult> {
  if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
  const format =
    ins.customWidget?.dateFormat ??
    calendarFormat(
      widgetEl.getAttribute('placeholder'),
      widgetEl.closest('[lang]')?.getAttribute('lang') ?? doc.documentElement.lang,
    )
  const date = parseCalendarDate(ins.proposedValue, format)
  if (!date) {
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Couldn't read "${ins.proposedValue}" as a date.`,
    )
  }

  // Editable input → type the value (the simplest reliable path when allowed). The
  // widget element ITSELF is the input for probe-detected datepickers (the scan
  // stamped data-qf-id on the `<input>`), so check it before searching descendants.
  const input = (
    widgetEl.matches('input') ? widgetEl : queryIn(widgetEl, 'input')
  ) as HTMLInputElement | null
  if (input && !isReadonly(input) && !isDisabled(input)) {
    setValue(
      input,
      input.type === 'date'
        ? formatCalendarDate(date, 'YYYY-MM-DD')
        : formatCalendarDate(date, format),
    )
    await settle()
    const got = readValue(input)
    if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
    // "Non-empty" is NOT acceptance: a constrained picker (min/max) clears or
    // restores a rejected value — require the day + year to survive in the text.
    if (dateLanded(got, date, format)) return success(ins.detectedFieldId, got)
  }

  await observeWidgetPopup(widgetEl, doc, async () => {
    if (trigger.getAttribute('aria-expanded') !== 'true') clickElement(trigger)
    await waitForWidget(
      () => widgetPopupRoots(ins.customWidget!, widgetEl, trigger, doc).find(looksLikeCalendar),
      operation,
    )
  })
  if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
  const calendar = widgetPopupRoots(ins.customWidget!, widgetEl, trigger, doc).find(
    looksLikeCalendar,
  )
  if (!calendar)
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      'Calendar could not be associated with this field — pick the date manually.',
    )
  const cell = await navigateCalendar(
    widgetEl,
    calendar,
    date,
    root,
    trigger,
    ins.customWidget!,
    operation,
  )
  if (!cell) {
    return assisted(
      ins.detectedFieldId,
      ins.proposedValue,
      `Open the calendar and pick ${ins.proposedValue}.`,
    )
  }
  if (!operationActive(operation)) return skip(ins.detectedFieldId, 'Widget operation cancelled.')
  // Some pickers need an explicit Apply (e.g. @vuepic without auto-apply).
  const currentCalendar = widgetPopupRoots(ins.customWidget!, widgetEl, trigger, doc).find(
    looksLikeCalendar,
  )
  const apply =
    currentCalendar && queryIn(currentCalendar, '.dp__action_select, [data-test="apply"]')
  if (apply) {
    clickElement(apply)
    await settle()
  }
  const accepted = input ? readValue(input) : readDisplay(widgetEl, ins.customWidget!, doc)
  return dateLanded(accepted, date, format) && isValid(input ?? widgetEl)
    ? success(ins.detectedFieldId, accepted)
    : assisted(
        ins.detectedFieldId,
        accepted,
        'Calendar interaction could not be verified — confirm the selected date.',
      )
}

/**
 * Whether the committed text represents exactly the same day, month and year.
 */
function dateLanded(got: string, date: TargetDate, format: CalendarFormat): boolean {
  const accepted = parseCalendarDate(got, format)
  return (
    !!accepted &&
    accepted.day === date.day &&
    accepted.month === date.month &&
    accepted.year === date.year
  )
}

/**
 * Page the open calendar to the target month/year, then click its day cell. Returns
 * the clicked cell, or null when the month can't be reached or the day isn't found.
 */
async function navigateCalendar(
  widgetEl: Element,
  _doc: ParentNode,
  date: TargetDate,
  root: FillRoot,
  trigger: Element,
  widget: CustomWidget,
  operation: WidgetOperation = {},
): Promise<Element | null> {
  const liveCalendar = (): Element | undefined =>
    widgetPopupRoots(widget, widgetEl, trigger, ownerDocOf(widgetEl)).find(looksLikeCalendar)
  for (let i = 0; i < 24 && operationActive(operation); i++) {
    const current = liveCalendar()
    if (!current) return null
    const heading = calendarHeading(current, current)
    if (heading !== null && headingMatches(heading, date)) break
    const nav = navButton(current, current, heading, date)
    if (!nav) break
    clickOption(nav, trigger, root)
    const moved = await waitForWidget(() => {
      const next = liveCalendar()
      return next && calendarHeading(next, next) !== heading
    }, operation)
    if (!moved) return null
  }
  if (!operationActive(operation)) return null
  const current = liveCalendar()
  if (!current) return null
  const heading = calendarHeading(current, current)
  if (!heading || !headingMatches(heading, date)) return null
  const cell = dayCell(current, current, date)
  if (!cell) return null
  clickOption(cell, trigger, root)
  await settle()
  return cell
}

/** Whether a header string names the target month and year. */
function headingMatches(heading: string, date: TargetDate): boolean {
  const current = calendarMonthYear(heading)
  return current?.month === date.month && current.year === date.year
}

/**
 * The previous/next-month button to step toward the target. Direction is chosen
 * from the current heading when it can be read, else defaults to "next". Disabled
 * buttons are skipped — a range-edge calendar (its min/max reached) renders the nav
 * disabled, and pressing it forever would just spin the loop.
 */
function navButton(
  doc: ParentNode,
  widgetEl: Element,
  heading: string | null,
  date: TargetDate,
): Element | null {
  const goBack = heading !== null && headingIsAfter(heading, date)
  const forward =
    '[aria-label*="next" i], [data-test-id*="next" i], [data-testid*="next" i], ' +
    '[class*="next" i], .dp__inner_nav_next, button[class*="next" i]'
  const backward =
    '[aria-label*="prev" i], [aria-label*="previous" i], [data-test-id*="prev" i], ' +
    '[data-testid*="prev" i], [class*="prev" i], .dp__inner_nav, button[class*="prev" i]'
  const sel = goBack ? backward : forward
  for (const scope of [widgetEl, doc] as ParentNode[]) {
    let matches: Element[]
    try {
      matches = Array.from(scope.querySelectorAll(sel))
    } catch {
      matches = []
    }
    for (const m of matches) {
      if (!isDayDisabled(m)) return m
    }
  }
  return null
}

/** Whether the displayed month/year is later than the target (so we must page back). */
function headingIsAfter(heading: string, date: TargetDate): boolean {
  const current = calendarMonthYear(heading)
  return (
    !!current &&
    (current.year > date.year || (current.year === date.year && current.month > date.month))
  )
}

/**
 * The day cell for the target date: matched by full-date aria-label (ordinal
 * suffixes tolerated — "June 1st, 2032"), else day-number text in the verified
 * target month. A disabled or absent day is never replaced with another date.
 */
function dayCell(doc: ParentNode, widgetEl: Element, date: TargetDate): Element | null {
  const cells = dayCellNodes(doc, widgetEl)
  if (cells.length === 0) return null
  const day = String(date.day)
  const byLabel = cells.find((c) => {
    if (isDayDisabled(c)) return false
    const parsed = parseCalendarDate(c.getAttribute('aria-label') ?? '')
    return parsed?.year === date.year && parsed.month === date.month && parsed.day === date.day
  })
  if (byLabel) return byLabel
  // Fall back to the day number, skipping disabled / adjacent-month cells.
  const byText = cells.find(
    (c) => !isDayDisabled(c) && !isAdjacentMonth(c) && norm(textOf(c)) === day,
  )
  if (byText) return byText
  return null
}

async function undoCustomSelect(
  entry: UndoEntry,
  widget: CustomWidget,
  root: FillRoot,
  bound?: Fillable,
  operation: WidgetOperation = {},
): Promise<FillResult> {
  const prev = entry.previousDisplayText
  const widgetEl =
    bound ?? findElement(root, markedSelectors(entry.detectedFieldId, entry.selectorCandidates))
  if (!widgetEl) return skip(entry.detectedFieldId, 'Element not found on the page.')
  const parentOperation = operation
  operation = {
    ...parentOperation,
    isCurrent: () => widgetEl.isConnected && parentOperation.isCurrent?.() !== false,
  }
  const doc = ownerDocOf(widgetEl)
  const trigger = resolveTrigger(widgetEl)
  if (entry.previousSelectedValues) {
    if (!widget.selectionItemSelector && entry.appliedSelectedValues === undefined)
      return skip(
        entry.detectedFieldId,
        'Reset this multiselect manually — its current selection cannot be read reliably.',
      )
    const before = entry.previousSelectedValues
    const current = selectionValues(widgetEl, widget) ?? entry.appliedSelectedValues ?? []
    for (const value of current.filter((v) => !before.includes(v))) {
      if (!operationActive(operation) || !widgetEl.isConnected)
        return skip(entry.detectedFieldId, 'Undo cancelled.')
      const remove = Array.from(
        widgetEl.querySelectorAll('[role="button"][aria-label], button[aria-label]'),
      ).find((el) => el.getAttribute('aria-label') === `Remove ${value}`)
      if (remove) clickElement(remove)
      else {
        await observeWidgetPopup(widgetEl, doc, async () => {
          if (trigger.getAttribute('aria-expanded') !== 'true') clickElement(trigger)
          await waitForWidget(
            () => openOptionNodes(widget, widgetEl, trigger, doc).length > 0,
            operation,
          )
        })
        const option = await resolveOption(widget, widgetEl, trigger, doc, value, operation)
        if (!operationActive(operation) || !widgetEl.isConnected)
          return skip(entry.detectedFieldId, 'Undo cancelled.')
        if (!option || !optionIsSelected(option))
          return skip(
            entry.detectedFieldId,
            'Reset this multiselect manually — the previous selection could not be restored.',
          )
        clickOption(option, trigger, root)
      }
      await settle()
    }
    for (const value of before) {
      if (!operationActive(operation) || !widgetEl.isConnected)
        return skip(entry.detectedFieldId, 'Undo cancelled.')
      if (selectionValues(widgetEl, widget)?.includes(value)) continue
      if (trigger.getAttribute('aria-expanded') !== 'true') clickElement(trigger)
      const option = await resolveOption(widget, widgetEl, trigger, doc, value, operation)
      if (!operationActive(operation) || !widgetEl.isConnected)
        return skip(entry.detectedFieldId, 'Undo cancelled.')
      if (!option) return skip(entry.detectedFieldId, 'A previous option is no longer available.')
      if (!optionIsSelected(option)) clickOption(option, trigger, root)
      await settle()
    }
    const restored =
      selectionValues(widgetEl, widget) ??
      openOptionNodes(widget, widgetEl, trigger, doc).filter(optionIsSelected).map(optionLabelText)
    return JSON.stringify([...restored].sort()) === JSON.stringify([...before].sort())
      ? success(entry.detectedFieldId, before.join(', '))
      : fail(entry.detectedFieldId, 'Multiselect did not accept its previous selection.')
  }
  if (!prev)
    return skip(entry.detectedFieldId, "Couldn't auto-undo this dropdown — reset it manually.")
  if (widget.kind === 'datepicker') {
    return fillDatePicker(
      {
        ...entry,
        tagName: widgetEl.tagName.toLowerCase(),
        inputType: 'customSelect',
        fillStrategy: 'customSelect',
        proposedValue: prev,
      },
      widgetEl,
      trigger,
      root,
      doc,
      operation,
    )
  }
  if (widget.kind === 'multiselect') {
    return skip(
      entry.detectedFieldId,
      'Reset this multiselect manually — automatic restore is not supported.',
    )
  }
  return (
    await fillCustomSelect(
      {
        ...entry,
        tagName: widgetEl.tagName.toLowerCase(),
        inputType: 'customSelect',
        fillStrategy: 'customSelect',
        proposedValue: prev,
      },
      widget,
      root,
      new Set(),
      widgetEl,
      operation,
    )
  ).result
}

function selectionValues(widgetEl: Element, widget: CustomWidget): string[] | null {
  if (!widget.selectionItemSelector) return null
  try {
    return Array.from(widgetEl.querySelectorAll(widget.selectionItemSelector))
      .map(textOf)
      .filter(Boolean)
  } catch {
    return null
  }
}

function readSelectedValues(
  widgetEl: Element,
  widget: CustomWidget,
  trigger: Element,
  doc: Document,
): string[] | undefined {
  const selected = selectionValues(widgetEl, widget)
  if (selected) return selected
  const nodes = openOptionNodes(widget, widgetEl, trigger, doc)
  const readable =
    nodes.length > 0 &&
    nodes.every(
      (n) =>
        n.hasAttribute('aria-selected') ||
        n.hasAttribute('aria-checked') ||
        n.hasAttribute('data-state') ||
        n.querySelector('input[type="checkbox"]'),
    )
  return readable ? nodes.filter(optionIsSelected).map(optionLabelText) : undefined
}

function readDisplay(widgetEl: Element, widget: CustomWidget, _doc: Document): string {
  const selections = selectionValues(widgetEl, widget)
  if (selections) return selections.join(', ')
  for (const sel of widget.valueDisplaySelectorCandidates) {
    const m = queryIn(widgetEl, sel)
    if (m) return displayValue(m)
  }
  return displayValue(resolveTrigger(widgetEl))
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

// --- DOM primitives -------------------------------------------------------

function isDisabled(el: Element): boolean {
  return (
    el.matches(':disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.hasAttribute('disabled') ||
    (el as HTMLInputElement).disabled === true
  )
}
function isValid(el: Element): boolean {
  if (el.matches('input, textarea')) {
    const control = el as HTMLInputElement
    // Browsers do not set tooLong/tooShort for values assigned by script.
    if (
      (control.maxLength >= 0 && control.value.length > control.maxLength) ||
      (control.minLength > 0 &&
        control.value.length > 0 &&
        control.value.length < control.minLength)
    )
      return false
  }
  return (
    el.isConnected &&
    (el as HTMLInputElement).validity?.valid !== false &&
    el.getAttribute('aria-invalid') !== 'true'
  )
}
function isReadonly(el: Fillable): boolean {
  return el.hasAttribute('readonly') || (el as HTMLInputElement).readOnly === true
}

function readValue(el: Fillable): string {
  if (isAriaToggle(el)) return el.getAttribute('aria-checked') ?? ''
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
  activateToggle(el, checked)
}

function setNativeValue(el: Fillable, value: string): void {
  const proto = Object.getPrototypeOf(el) as object
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) descriptor.set.call(el, value)
  else (el as HTMLInputElement).value = value
}

function dispatch(el: Element, type: 'input' | 'change' | 'blur'): void {
  el.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
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
