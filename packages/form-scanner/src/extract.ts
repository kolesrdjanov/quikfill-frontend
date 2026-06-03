import type { FieldOption } from '@quikfill/schemas'

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image'])

/** True for elements we treat as fillable form controls. */
export function isFormControl(el: Element): el is FormControl {
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type.toLowerCase()
    return !SKIP_INPUT_TYPES.has(type)
  }
  if (el.hasAttribute('contenteditable')) {
    const v = el.getAttribute('contenteditable')
    return v === '' || v === 'true' || v === 'plaintext-only'
  }
  return false
}

/**
 * Detect an autocomplete widget that owns this input's value — one whose
 * suggestion dropdown the user must pick from (picking is what populates the
 * site's dependent fields). Returns the widget kind, or undefined. Extensible:
 * add more signatures as other widgets are supported.
 */
export function detectAutocomplete(el: FormControl): 'googlePlaces' | undefined {
  // Google Places Autocomplete tags the <input> it attaches to with this class.
  if (el.classList.contains('pac-target-input')) return 'googlePlaces'
  return undefined
}

export function getInputType(el: FormControl): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input') return (el as HTMLInputElement).type.toLowerCase() || 'text'
  if (tag === 'textarea') return 'textarea'
  if (tag === 'select') return 'select'
  if (el.hasAttribute('contenteditable')) return 'contenteditable'
  return tag
}

/**
 * A placeholder that spells out a full date format: d/m/y runs and separators with
 * all three parts present (e.g. "MM/DD/YYYY", "DD.MM.YYYY", "yyyy-mm-dd").
 */
const DATE_FORMAT_PLACEHOLDER_RE = /^[^a-z0-9]*[dmy]{1,4}([^a-z0-9]+[dmy]{1,4}){2}[^a-z0-9]*$/i

/** Class names that mark a date-widget container (vue-datepicker, react-datepicker, …). */
const DATEPICKER_CONTAINER_RE = /datepicker|date-picker|date_picker|calendar/i

/** True when a placeholder names a full date format (all of d, m, y present). */
export function hasDateFormatPlaceholder(placeholder: string | null | undefined): boolean {
  const p = (placeholder ?? '').toLowerCase()
  return DATE_FORMAT_PLACEHOLDER_RE.test(p) && p.includes('d') && p.includes('m') && p.includes('y')
}

/**
 * True for a text `<input>` that reads as a datepicker's trigger: a date-format
 * placeholder, or a datepicker-ish container class on it or an ancestor (≤5 up).
 * Calendar widgets (@vuepic/vue-datepicker, react-datepicker, …) make their visible
 * input `readonly` because you pick from the calendar, not by typing — this predicate
 * is what lets such an input survive the readonly skip in the scan so the probe can
 * confirm it by opening the calendar. The probe (which actually clicks and watches for
 * a calendar) is the real gate; a false positive here degrades to a harmless read-only
 * skip at fill time.
 */
export function looksLikeDatepickerInput(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'input') return false
  const type = (el as HTMLInputElement).type.toLowerCase()
  if (type && type !== 'text') return false
  if (hasDateFormatPlaceholder(el.getAttribute('placeholder'))) return true
  let node: Element | null = el
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    if (DATEPICKER_CONTAINER_RE.test(node.getAttribute('class') ?? '')) return true
  }
  return false
}

/** HTML5 constraint-validation attributes a model can use to produce a valid value. */
export interface ValidationAttrs {
  pattern?: string
  minLength?: number
  maxLength?: number
  min?: string
  max?: string
}

/**
 * Read the constraint-validation attributes off a control. `minLength`/`maxLength`
 * are parsed to non-negative integers; `min`/`max` stay raw strings because their
 * meaning depends on `inputType` (a number, a date, or a time). Absent/blank attrs
 * are omitted so they round-trip as `undefined` through the schema.
 */
export function getValidationAttrs(el: FormControl): ValidationAttrs {
  const out: ValidationAttrs = {}
  const pattern = el.getAttribute('pattern')
  if (pattern) out.pattern = pattern
  const minLength = parseNonNegativeInt(el.getAttribute('minlength'))
  if (minLength !== undefined) out.minLength = minLength
  const maxLength = parseNonNegativeInt(el.getAttribute('maxlength'))
  if (maxLength !== undefined) out.maxLength = maxLength
  const min = el.getAttribute('min')
  if (min) out.min = min
  const max = el.getAttribute('max')
  if (max) out.max = max
  return out
}

function parseNonNegativeInt(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export function getCurrentValue(el: FormControl): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return (el as HTMLInputElement).value ?? null
  if (tag === 'select') {
    const sel = el as HTMLSelectElement
    return sel.multiple
      ? Array.from(sel.selectedOptions)
          .map((o) => o.value)
          .join(',')
      : sel.value
  }
  if (el.hasAttribute('contenteditable')) return el.textContent ?? null
  return null
}

/**
 * Resolve a control's label. Tries, in order: `<label for=id>`, a wrapping
 * `<label>`, then the nearest container `<label>` (for layouts where the label
 * is a *sibling/cousin* of the input, not linked by `for=` and not wrapping it).
 * That last fallback is what lets fields with no `name`/`id` (or an opaque id
 * like `map`) still get a human label instead of falling through to `qf-N`.
 */
export function getLabelText(el: FormControl, root: Document | ShadowRoot): string | undefined {
  const id = el.getAttribute('id')
  if (id) {
    const forLabel = root.querySelector(`label[for="${cssEscape(id)}"]`)
    const text = forLabel?.textContent?.trim()
    if (text) return text
  }
  const wrapping = el.closest('label')
  const wrapText = wrapping?.textContent?.trim()
  if (wrapText) return wrapText
  return getContainerLabel(el)
}

/**
 * Climb to the smallest ancestor that still wraps this one control and read its
 * `<label>`. Handles the common "label and input are cousins" layout:
 *   `<div><label>Email*</label><div class="relative"><input></div></div>`
 * Stops before any ancestor that spans multiple controls, so a field can only
 * claim a label that unambiguously belongs to it.
 */
function getContainerLabel(el: FormControl): string | undefined {
  let node = el.parentElement
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    if (countFormControls(node) > 1) break
    const label = node.querySelector('label')
    if (label) {
      const text = cleanLabelText(label)
      if (text) return text
    }
  }
  return undefined
}

function countFormControls(root: Element): number {
  let n = 0
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (isFormControl(el)) n++
  }
  return n
}

/** Label text minus nested control values, icon/SVG noise, and a trailing required `*`. */
function cleanLabelText(label: Element): string {
  const clone = label.cloneNode(true) as Element
  for (const junk of Array.from(clone.querySelectorAll('svg, input, textarea, select'))) {
    junk.remove()
  }
  return (clone.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\*\s*$/, '')
    .trim()
}

export function getAriaLabel(el: Element): string | undefined {
  return el.getAttribute('aria-label')?.trim() || undefined
}

export function getAriaLabelledByText(
  el: Element,
  root: Document | ShadowRoot,
): string | undefined {
  const ids = el.getAttribute('aria-labelledby')?.trim()
  if (!ids) return undefined
  const text = ids
    .split(/\s+/)
    .map((id) => root.querySelector(`#${cssEscape(id)}`)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  return text || undefined
}

/** Nearest preceding heading text, used as a section hint. */
export function getSectionHeading(el: Element): string | undefined {
  let node: Element | null = el
  while (node) {
    const heading = findPrecedingHeading(node)
    if (heading) return heading
    node = node.parentElement
  }
  return undefined
}

function findPrecedingHeading(el: Element): string | undefined {
  let sib = el.previousElementSibling
  while (sib) {
    if (/^h[1-6]$/i.test(sib.tagName) || sib.getAttribute('role') === 'heading') {
      const text = sib.textContent?.trim()
      if (text) return text
    }
    sib = sib.previousElementSibling
  }
  return undefined
}

/**
 * The question label for a radio group (one field representing N radios sharing a
 * name): the wrapping `<fieldset>`'s `<legend>`, else the nearest section heading.
 * Falls through to undefined so the planner can use the group's `name`.
 */
export function getRadioGroupLabel(radio: HTMLInputElement): string | undefined {
  const legend = radio.closest('fieldset')?.querySelector('legend')
  const legendText = legend?.textContent?.replace(/\s+/g, ' ').trim()
  if (legendText) return legendText
  return getSectionHeading(radio)
}

/** Short snippet of nearby text in the control's parent, for disambiguation. */
export function getNearbyText(el: FormControl): string | undefined {
  const parentText = el.parentElement?.textContent?.replace(/\s+/g, ' ').trim()
  if (!parentText) return undefined
  return parentText.length > 120 ? parentText.slice(0, 120) : parentText
}

export function getOptions(el: FormControl): FieldOption[] | undefined {
  const tag = el.tagName.toLowerCase()
  if (tag === 'select') {
    return Array.from((el as HTMLSelectElement).options).map((o) => ({
      value: o.value,
      label: o.textContent?.trim() ?? o.value,
      selected: o.selected,
    }))
  }
  if (tag === 'input') {
    const input = el as HTMLInputElement
    if ((input.type === 'radio' || input.type === 'checkbox') && input.name) {
      return undefined // grouping handled at a higher level later; v1 keeps per-element
    }
  }
  return undefined
}

/**
 * Visibility without relying on layout (jsdom-safe): hidden attr, type=hidden,
 * display:none, visibility:hidden, or — when real layout is available — zero
 * rendered boxes (the element sits inside a display:none ancestor / an inactive
 * tab panel, so the page never shows it). The geometry pass is what excludes the
 * framework-generated, never-rendered inputs that otherwise surface as `_r_*`
 * noise; it is gated on `hasLayout` so jsdom (no layout) keeps the style-only path.
 */
export function isVisible(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false
  if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'hidden') {
    return false
  }
  const style = safeComputedStyle(el)
  if (style) {
    if (style.display === 'none') return false
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
    if (style.opacity === '0') return false
  }
  // Computed `display` is reported per-element, so it is NOT `none` for a child of
  // a display:none ancestor — only the rendered-box count reveals that. An sr-only
  // control is clipped to ~1×1 but still laid out, so it keeps a client rect and
  // survives; a never-rendered input has none.
  if (hasLayout(el.ownerDocument) && !isRendered(el)) return false
  return true
}

/** True when the element produces at least one rendered box (i.e. is laid out). */
function isRendered(el: Element): boolean {
  try {
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) return true
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  } catch {
    return true // can't measure → don't hide it on a measurement failure
  }
}

/**
 * Feature-detect a real layout engine by measuring `<body>`: a browser gives it a
 * non-zero box, jsdom reports 0×0. Gating the geometry pass on this keeps every
 * jsdom unit test on the style-only path while real pages get the stricter check.
 */
function hasLayout(doc: Document | null | undefined): boolean {
  const body = doc?.body
  if (!body) return false
  try {
    const r = body.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  } catch {
    return false
  }
}

function safeComputedStyle(el: Element): CSSStyleDeclaration | undefined {
  try {
    const view = el.ownerDocument?.defaultView
    return view?.getComputedStyle(el) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Ranked selector candidates: id → name → stable attrs → structural path.
 * Never a single brittle selector — the matcher tries them in order.
 */
export function getSelectorCandidates(el: Element): string[] {
  const candidates: string[] = []
  const id = el.getAttribute('id')
  if (id) candidates.push(`#${cssEscape(id)}`)

  const name = el.getAttribute('name')
  const tag = el.tagName.toLowerCase()
  if (name) candidates.push(`${tag}[name="${cssEscape(name)}"]`)

  const dataTestId = el.getAttribute('data-testid')
  if (dataTestId) candidates.push(`${tag}[data-testid="${cssEscape(dataTestId)}"]`)

  // NB: autocomplete is deliberately NOT a candidate. Its value is a fixed token
  // set (off/on/organization/email/…), so `input[autocomplete="off"]` matches the
  // first such input on the page — not the intended one. It stays as matching
  // metadata only (DetectedField.autocomplete). See getSelectorCandidates callers.
  candidates.push(structuralPath(el))
  return Array.from(new Set(candidates))
}

function structuralPath(el: Element): string {
  const segments: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && node.nodeType === 1 && depth < 5) {
    const current: Element = node
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      segments.unshift(`#${cssEscape(current.id)}`)
      break
    }
    const parent = current.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === current.tagName)
      const index = sameTag.indexOf(current) + 1
      segments.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    } else {
      segments.unshift(tag)
    }
    node = parent
    depth++
  }
  return segments.join(' > ')
}

// --- Custom (non-native) select detection ---------------------------------

/** Matches an option node inside a custom dropdown, once its list is present. */
export const CUSTOM_OPTION_SELECTOR = '[role="option"], [role="button"][aria-label*="option" i]'

/** Information needed to detect, classify, and later fill a custom select. */
export interface CustomSelectInfo {
  /** How the filler must drive the widget: single select, multi-select, or a calendar. */
  kind: 'select' | 'multiselect' | 'datepicker'
  /** Stable field-level container (used for label, selectors, option scoping). */
  widgetRoot: Element
  /** Element to click to open the option list. */
  trigger: Element
  /** Node whose text reflects the current selection (for verification). */
  valueDisplay: Element | null
  /** Selector matching each option node, scoped to the widget root at fill time. */
  optionItemSelector: string
  /** Option labels in DOM order. */
  optionLabels: string[]
  /** Currently displayed selection text, if any. */
  selectedLabel: string | null
  /** The open list's element id (trigger's aria-controls/aria-owns), for portal resolution. */
  listboxId: string | null
  /** The widget's typeahead/filter input, when it has one. */
  searchInput: Element | null
  /** Attribute on option nodes carrying a stable value/code (e.g. `data-value`). */
  optionValueAttr: string | null
  /** Whether the widget filters options as the user types. */
  isSearchable: boolean
  /** Whether the option list is virtualized (only visible rows rendered). */
  isVirtualized: boolean
}

/** Known virtual-scroller markers — a hint that only visible options are in the DOM. */
const VIRTUAL_SCROLLER_SELECTOR =
  '.rc-virtual-list-holder, .cdk-virtual-scroll-viewport, [class*="virtual" i]'

/** Attributes an option may carry a stable value/code in, in preference order. */
const OPTION_VALUE_ATTRS = ['data-value', 'data-option-value', 'data-key', 'value']

/** A calendar popup matches this; such a widget is a datepicker, not a value list. */
const CALENDAR_SELECTOR = '[role="grid"], [role="gridcell"]'

/** A trigger's text/label that reads as a "nothing chosen yet" prompt. */
const PLACEHOLDER_TEXT_RE = /^(select|choose|please\s+choose|pick)\b/i

/** Class hints that an element is (or contains) a dropdown chevron/caret affordance. */
const CHEVRON_HINT_RE = /chevron|caret|arrow|expand|dropdown|angle/i

/**
 * How strongly an element signals "custom select".
 * - `strong`: an unambiguous select/listbox opener (role=combobox,
 *   aria-haspopup=listbox, data-trigger=select). These own an option list even
 *   before it is rendered, so we can detect them with the list still closed.
 * - `heuristic`: an ARIA-less dropdown trigger inferred structurally (placeholder
 *   text + chevron + labelled field). Treated like `strong` (detected closed); the
 *   filler confirms by opening it and backs off if no option list appears.
 * - `weak`: could be a select but could equally be an accordion/menu/disclosure
 *   (a plain expandable or aria-controls button). We treat it as a select only
 *   once its options are actually present in the DOM.
 * - `null`: not a trigger.
 */
function customSelectStrength(el: Element): 'strong' | 'heuristic' | 'weak' | null {
  const role = el.getAttribute('role')
  // A menu button opens *actions* (role=menu/menuitem), not a value list — never a
  // fillable select. Bail before the weaker role=button+aria-expanded check below
  // would otherwise pick it up.
  if (el.getAttribute('aria-haspopup') === 'menu' || role === 'menu') return null
  if (role === 'combobox') return 'strong'
  if (el.getAttribute('aria-haspopup') === 'listbox') return 'strong'
  if (
    el.getAttribute('aria-haspopup') === 'dialog' ||
    el.getAttribute('aria-haspopup') === 'grid'
  ) {
    return 'strong' // a datepicker/dialog opener — classified to kind in detectCustomSelect
  }
  // A data-trigger is a deliberate opt-in: honor it only for "select" and, as
  // before, treat data-trigger="<other>" as explicitly NOT a select trigger.
  if (el.hasAttribute('data-trigger')) {
    return el.getAttribute('data-trigger') === 'select' ? 'strong' : null
  }
  if (role === 'button' && el.hasAttribute('aria-expanded')) return 'weak'
  if (el.hasAttribute('aria-controls') && (role === 'button' || role === 'combobox')) return 'weak'
  if (looksLikeHeuristicSelect(el)) return 'heuristic'
  return null
}

/**
 * Spot a dropdown trigger that exposes NO ARIA at all — a clickable button/role=button
 * that shows a placeholder prompt ("Select…", "Choose…"), carries a chevron, and lives
 * in a labelled field that holds no native input. The labelled-field-with-no-input guard
 * is load-bearing: it rejects an adjunct control like a phone country-code button sitting
 * beside the real <input> (treating that as the field would swallow the input). The
 * filler re-confirms by opening it, so a false positive degrades to a harmless no-op.
 */
function looksLikeHeuristicSelect(el: Element): boolean {
  const clickable = el.tagName.toLowerCase() === 'button' || el.getAttribute('role') === 'button'
  if (!clickable || (el as HTMLButtonElement).type === 'submit') return false
  const hasChevron =
    CHEVRON_HINT_RE.test(el.getAttribute('class') ?? '') ||
    el.querySelector('[class*="chevron" i], [class*="caret" i], [class*="arrow" i]') !== null ||
    el.querySelector('svg') !== null
  if (!hasChevron) return false
  const prompts = PLACEHOLDER_TEXT_RE.test(normalizeWidgetText(el))
  const labelPrompt = PLACEHOLDER_TEXT_RE.test(el.getAttribute('aria-label') ?? '')
  if (!prompts && !labelPrompt) return false
  const field = labelledFieldContainer(el)
  return field !== null && countFormControls(field) === 0
}

/** The nearest ancestor (≤5 up) that contains a `<label>` — the trigger's field wrapper. */
function labelledFieldContainer(el: Element): Element | null {
  let node = el.parentElement
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    if (node.querySelector('label')) return node
  }
  return null
}

/** Cheap pre-check: does this element look like a custom-select trigger? */
export function isCustomSelectTrigger(el: Element): boolean {
  return customSelectStrength(el) !== null
}

/**
 * Resolve a custom select from a candidate trigger. Returns null when no option
 * list can be found (the guard that keeps plain buttons from being treated as
 * dropdowns). Broad by design — covers ARIA comboboxes/listboxes plus common
 * library markup (data-trigger="select", option-labeled buttons).
 */
export function detectCustomSelect(trigger: Element): CustomSelectInfo | null {
  const strength = customSelectStrength(trigger)
  if (!strength) return null

  // 1) Locate the option list. Prefer aria-controls, else the nearest ancestor
  //    that contains option nodes. May be null when the list is closed/unrendered.
  const optionsScope = findOptionsScope(trigger)
  const optionNodes = optionsScope
    ? Array.from(optionsScope.querySelectorAll(CUSTOM_OPTION_SELECTOR))
    : []
  // The trigger itself can match the option selector (role=button); exclude it.
  const options = optionNodes.filter((o) => o !== trigger && !trigger.contains(o))

  // 2) Current selection display: a value-ish child of the trigger, else trigger text.
  const valueDisplay = trigger.querySelector('[class*="value" i], [class*="selected" i]') ?? trigger
  // A typeahead/filter input inside the widget (the user's `input#_r_ag_` case, or a
  // role=combobox input). Drives the type-to-filter fill tier.
  const searchInput = findSearchInput(trigger, optionsScope)
  const base = {
    kind: classifyWidgetKind(trigger, optionsScope),
    trigger,
    valueDisplay: valueDisplay === trigger ? null : valueDisplay,
    optionItemSelector: CUSTOM_OPTION_SELECTOR,
    selectedLabel: normalizeWidgetText(valueDisplay) || null,
    listboxId: trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns') ?? null,
    searchInput,
    optionValueAttr: detectOptionValueAttr(options[0] ?? null),
    isSearchable: searchInput !== null,
    isVirtualized: isListVirtualized(optionsScope),
  }

  // 3) No option nodes in the DOM yet. A strong signal (combobox / haspopup=listbox
  //    / data-trigger=select) or a heuristic ARIA-less trigger reliably owns an
  //    on-demand list, so detect it now with empty options — the filler opens the
  //    trigger and reads the list at fill time. A weak signal could be an
  //    accordion/menu/disclosure, so without visible options we decline (the guard
  //    that keeps plain buttons from becoming selects).
  if (options.length === 0) {
    if (strength === 'weak') return null
    return { ...base, widgetRoot: resolveWidgetRoot(trigger, null), optionLabels: [] }
  }

  return {
    ...base,
    widgetRoot: resolveWidgetRoot(trigger, optionsScope),
    optionLabels: options.map((o) => normalizeWidgetText(o)).filter(Boolean),
  }
}

/**
 * Classify a custom widget by what its trigger opens: a calendar grid (datepicker),
 * a multi-choice list (multiselect), or a plain single-choice list (select). The
 * grid/multiselectable signals are read from the trigger's own attributes and any
 * already-open scope, so a closed on-demand widget still classifies from the trigger.
 */
function classifyWidgetKind(
  trigger: Element,
  optionsScope: Element | null,
): 'select' | 'multiselect' | 'datepicker' {
  const haspopup = trigger.getAttribute('aria-haspopup')
  if (haspopup === 'dialog' || haspopup === 'grid') return 'datepicker'
  if (optionsScope?.matches(CALENDAR_SELECTOR) || optionsScope?.querySelector(CALENDAR_SELECTOR)) {
    return 'datepicker'
  }
  const multi =
    trigger.getAttribute('aria-multiselectable') === 'true' ||
    optionsScope?.getAttribute('aria-multiselectable') === 'true' ||
    optionsScope?.querySelector('[aria-multiselectable="true"]') != null
  return multi ? 'multiselect' : 'select'
}

/** The widget's typeahead/filter input (a text/search input or role=combobox), if any. */
function findSearchInput(trigger: Element, optionsScope: Element | null): Element | null {
  for (const scope of [trigger, optionsScope]) {
    const input = scope?.querySelector(
      'input[type="text"], input[type="search"], input:not([type]), [role="combobox"] input, input[role="combobox"]',
    )
    if (input) return input
  }
  return null
}

/** The first attribute the option carries a stable value in, or null. */
function detectOptionValueAttr(option: Element | null): string | null {
  if (!option) return null
  return OPTION_VALUE_ATTRS.find((attr) => option.hasAttribute(attr)) ?? null
}

/** Whether the option list lives inside a known virtual scroller. */
function isListVirtualized(optionsScope: Element | null): boolean {
  if (!optionsScope) return false
  return (
    optionsScope.matches(VIRTUAL_SCROLLER_SELECTOR) ||
    optionsScope.querySelector(VIRTUAL_SCROLLER_SELECTOR) != null ||
    optionsScope.closest(VIRTUAL_SCROLLER_SELECTOR) != null
  )
}

function findOptionsScope(trigger: Element): Element | null {
  const controls = trigger.getAttribute('aria-controls')
  if (controls) {
    const root = trigger.getRootNode() as Document | ShadowRoot
    const el = root.querySelector?.(`#${cssEscape(controls)}`)
    if (el && el.querySelector(CUSTOM_OPTION_SELECTOR)) return el
  }
  // Climb until an ancestor contains option nodes (siblings of the trigger).
  let node: Element | null = trigger
  for (let depth = 0; node && depth < 6; depth++) {
    if (node.querySelector(CUSTOM_OPTION_SELECTOR)) return node
    node = node.parentElement
  }
  return null
}

/**
 * The lowest ancestor (from the options scope upward) that wraps this one widget
 * and has a stable identity or its own label — a good field-level root. Stops at
 * the first match so we never over-climb into a form/page wrapper.
 */
function resolveWidgetRoot(trigger: Element, optionsScope: Element | null): Element {
  // Climb from the options scope when we have one, else from the trigger (closed
  // on-demand selects expose no list at scan time).
  let node: Element | null = optionsScope ?? trigger
  for (let i = 0; i < 4 && node; i++) {
    const wrapsOneWidget = node.contains(trigger) && countTriggers(node) <= 1
    const hasOwnIdentity = hasStableIdentity(node) || !!node.querySelector(':scope > label')
    if (wrapsOneWidget && hasOwnIdentity) return node
    node = node.parentElement
  }
  if (optionsScope?.contains(trigger)) return optionsScope
  return trigger.parentElement ?? trigger
}

function countTriggers(el: Element): number {
  let n = 0
  for (const cand of Array.from(el.querySelectorAll('*'))) {
    if (isCustomSelectTrigger(cand)) n++
  }
  return n
}

function hasStableIdentity(el: Element): boolean {
  return (
    el.hasAttribute('id') ||
    el.hasAttribute('name') ||
    el.hasAttribute('data-test-id') ||
    el.hasAttribute('data-testid')
  )
}

/** Text of an element minus nested SVG/icon noise, whitespace-collapsed. */
function normalizeWidgetText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  for (const svg of Array.from(clone.querySelectorAll('svg'))) svg.remove()
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Selectors that locate a custom-select trigger again at fill time. */
export function getTriggerSelectorCandidates(trigger: Element): string[] {
  return getSelectorCandidates(trigger)
}

/** Resolve a label for a custom widget via its inner input's id or the widget root. */
export function getWidgetLabel(
  widgetRoot: Element,
  root: Document | ShadowRoot,
): string | undefined {
  const inner = widgetRoot.querySelector('input[id], [id]')
  const id = inner?.getAttribute('id')
  if (id) {
    const forLabel = root.querySelector(`label[for="${cssEscape(id)}"]`)
    const text = forLabel?.textContent?.trim()
    if (text) return text
  }
  const ownLabel = widgetRoot.querySelector('label')
  if (ownLabel) {
    const text = cleanLabelText(ownLabel)
    if (text) return text
  }
  // Cousin layout: the <label> sits in an ancestor wrapper, not inside the widget
  // (common for on-demand selects with no inner <input> to link a `for=`). Climb to
  // the nearest single-widget container and read its label.
  return getContainerWidgetLabel(widgetRoot)
}

/**
 * Climb from a custom-select widget root to the nearest ancestor that still wraps
 * just this one widget and read its `<label>`. Stops before any ancestor holding a
 * second trigger, so a widget can only claim a label that unambiguously belongs to
 * it. Mirrors getContainerLabel for native controls.
 */
function getContainerWidgetLabel(widgetRoot: Element): string | undefined {
  let node = widgetRoot.parentElement
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    if (countTriggers(node) > 1) break
    const label = node.querySelector('label')
    if (label) {
      const text = cleanLabelText(label)
      if (text) return text
    }
  }
  return undefined
}

/** Minimal CSS.escape fallback for environments without it. */
export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  if (g.CSS?.escape) return g.CSS.escape(value)
  return value.replace(/["\\#.:>~+*^$|()=\s[\]]/g, '\\$&')
}
