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
 * display:none, visibility:hidden, or zero-size when layout is available.
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
  return true
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
}

/**
 * How strongly an element signals "custom select".
 * - `strong`: an unambiguous select/listbox opener (role=combobox,
 *   aria-haspopup=listbox, data-trigger=select). These own an option list even
 *   before it is rendered, so we can detect them with the list still closed.
 * - `weak`: could be a select but could equally be an accordion/menu/disclosure
 *   (a plain expandable or aria-controls button). We treat it as a select only
 *   once its options are actually present in the DOM.
 * - `null`: not a trigger.
 */
function customSelectStrength(el: Element): 'strong' | 'weak' | null {
  const role = el.getAttribute('role')
  if (role === 'combobox') return 'strong'
  if (el.getAttribute('aria-haspopup') === 'listbox') return 'strong'
  // A data-trigger is a deliberate opt-in: honor it only for "select" and, as
  // before, treat data-trigger="<other>" as explicitly NOT a select trigger.
  if (el.hasAttribute('data-trigger')) {
    return el.getAttribute('data-trigger') === 'select' ? 'strong' : null
  }
  if (role === 'button' && el.hasAttribute('aria-expanded')) return 'weak'
  if (el.hasAttribute('aria-controls') && (role === 'button' || role === 'combobox')) return 'weak'
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
  const base = {
    trigger,
    valueDisplay: valueDisplay === trigger ? null : valueDisplay,
    optionItemSelector: CUSTOM_OPTION_SELECTOR,
    selectedLabel: normalizeWidgetText(valueDisplay) || null,
  }

  // 3) No option nodes in the DOM yet. A strong signal (combobox / haspopup=listbox
  //    / data-trigger=select) reliably owns an on-demand list, so detect it now with
  //    empty options — the filler opens the trigger and reads the list at fill time.
  //    A weak signal could be an accordion/menu/disclosure, so without visible
  //    options we decline (the guard that keeps plain buttons from becoming selects).
  if (options.length === 0) {
    if (strength !== 'strong') return null
    return { ...base, widgetRoot: resolveWidgetRoot(trigger, null), optionLabels: [] }
  }

  return {
    ...base,
    widgetRoot: resolveWidgetRoot(trigger, optionsScope),
    optionLabels: options.map((o) => normalizeWidgetText(o)).filter(Boolean),
  }
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
