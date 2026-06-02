import type { CustomWidget } from '@quikfill/schemas'

/**
 * DOM primitives shared by the fill executor (`fill.ts`) and the scan-time
 * widget probe (`probe.ts`). Both drive custom widgets the way a user would —
 * synthetic pointer presses, option-list discovery, calendar reading — so the
 * machinery lives here once: one algorithm, used at probe time and fill time.
 */

export type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement

/**
 * Where element resolution happens. A Document/ShadowRoot keeps whole-page
 * behavior; an Element scopes to its subtree (a drawer/dialog), so a fuzzy
 * selector can never reach an element outside it.
 */
export type FillRoot = Document | ShadowRoot | Element

/** The Document a node belongs to (itself, when the node already is a Document). */
export function ownerDocOf(node: Node): Document {
  return node.ownerDocument ?? (node as Document)
}

export function focusEl(el: Fillable): void {
  if (typeof el.focus === 'function') {
    try {
      el.focus()
    } catch {
      /* focus can throw on detached nodes */
    }
  }
}

export function dispatchKey(el: Element, type: 'keydown' | 'keyup', key = 'Unidentified'): void {
  let ev: Event
  try {
    ev = new KeyboardEvent(type, { bubbles: true, key })
  } catch {
    ev = new Event(type, { bubbles: true })
  }
  el.dispatchEvent(ev)
}

/**
 * The element to press to OPEN a custom select, resolved STRICTLY inside the widget
 * container. We find the container reliably (its data-qf-id marker), but the
 * trigger's own serialized selector is often just a structural path that drifts at
 * fill time to an unrelated node — e.g. a stray icon `<button>` elsewhere in the
 * drawer — and clicking the wrong node collapses the whole drawer. The real trigger
 * always lives inside the widget root (see resolveWidgetRoot), so we scope the
 * search there and prefer the strongest opener markers. Returns the container itself
 * as a last resort.
 */
const TRIGGER_TIERS = [
  '[data-trigger="select"]',
  '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="dialog"], [aria-haspopup="grid"]',
  '[role="button"][aria-controls], [role="button"][aria-expanded]',
  '[role="button"], button',
]
export function resolveTrigger(widgetEl: Element): Element {
  for (const sel of TRIGGER_TIERS) {
    if (widgetEl.matches(sel)) return widgetEl
    const found = widgetEl.querySelector(sel)
    if (found) return found
  }
  return widgetEl
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
export function optionAutomationValues(node: Element, widget: CustomWidget): string[] {
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
 * the value; then to automation-tagged rows; and finally to REPEATING SIBLINGS — the
 * weakest signal (rows that merely look alike), so every stronger tier gets a chance
 * first. The trigger and empty rows are always excluded.
 */
export function openOptionNodes(
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
    const tagged = automationOptions(scope, trigger, widgetEl)
    if (tagged.length) return tagged
  }
  for (const scope of [linked, widgetEl].filter((s) => s !== null) as ParentNode[]) {
    const alike = repeatingSiblingOptions(scope, trigger)
    if (alike.length) return alike
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

/** Attributes whose presence (scoped to the widget) marks an automation-tagged option row. */
const OPTION_AUTOMATION_FIND_ATTRS = ['data-test-id', 'data-testid', 'data-cy', 'data-qa']

/**
 * Option rows that expose no ARIA role and no list structure, only an automation
 * attribute (e.g. `<div data-test-id="cat-option-US">`). Restricted to the widget's
 * own id-namespace (the container's data-test-id prefix) when it has one, so a stray
 * test-id elsewhere in the panel can't be mistaken for an option. Leaf rows only —
 * a node that wraps other tagged rows is a group container, not an option.
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
      !OPTION_AUTOMATION_FIND_ATTRS.some((a) => n.querySelector(`[${a}]`)) &&
      textOf(n) !== '',
  )
}

/** Max text length for a row to still read as a pickable option (not a paragraph). */
const MAX_OPTION_TEXT = 80

/** A row affords clicking: an interactive tag/role, or a pointer-cursor class hint. */
function looksClickable(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'button' || tag === 'a' || tag === 'li') return true
  const role = el.getAttribute('role')
  if (role === 'button' || role === 'option' || role === 'menuitem') return true
  if (/cursor-pointer|clickable|selectable|option|choice/i.test(el.getAttribute('class') ?? '')) {
    return true
  }
  return (
    el.querySelector('[role="button"], button, input[type="checkbox"], input[type="radio"]') !==
    null
  )
}

/** A node's shape signature: same tag + same class attr ⇒ "the same kind of row". */
function rowSignature(el: Element): string {
  return `${el.tagName}|${el.getAttribute('class') ?? ''}`
}

/**
 * The weakest, fully generic option-discovery tier: a container whose children are
 * REPEATING SIMILAR SIBLINGS — same tag + class signature, each with short non-empty
 * text and a clickable affordance. This is what identifies an options wrapper that
 * exposes no ARIA, no list structure, and no automation tags (plain styled `<div>`
 * rows). Calendars are excluded (a grid of day numbers also repeats — but it is a
 * datepicker, not a value list). Returns the largest qualifying sibling group.
 */
export function repeatingSiblingOptions(scope: ParentNode, trigger: Element): Element[] {
  let candidates: Element[]
  try {
    candidates = Array.from(scope.querySelectorAll('*'))
  } catch {
    return []
  }
  // The scope itself can be the options wrapper (its children are the rows).
  if ((scope as Element).nodeType === 1) candidates.unshift(scope as Element)
  let best: Element[] = []
  for (const container of candidates) {
    if (container === trigger || trigger.contains(container) || container.contains(trigger)) {
      continue
    }
    if (looksLikeCalendar(container)) continue
    const rows = similarChildRows(container, trigger)
    if (rows.length > best.length) best = rows
  }
  return best
}

/** The largest group of same-signature children that all read as option rows. */
function similarChildRows(container: Element, trigger: Element): Element[] {
  const groups = new Map<string, Element[]>()
  for (const child of Array.from(container.children)) {
    const sig = rowSignature(child)
    const group = groups.get(sig) ?? []
    group.push(child)
    groups.set(sig, group)
  }
  let best: Element[] = []
  for (const group of groups.values()) {
    if (group.length < 2 || group.length <= best.length) continue
    const allRows = group.every((row) => {
      if (row === trigger || row.contains(trigger)) return false
      const text = textOf(row)
      return text !== '' && text.length <= MAX_OPTION_TEXT && looksClickable(row)
    })
    if (allRows) best = group
  }
  return best
}

/**
 * Whether a subtree reads as a calendar rather than a value list: a grid role, many
 * 1–2-digit numeric cells, or library day-cell class names. Used both to keep the
 * repeating-sibling tier off datepickers and by the probe to recognize one opening.
 */
export function looksLikeCalendar(el: Element): boolean {
  try {
    if (el.matches('[role="grid"]') || el.querySelector('[role="grid"]')) return true
    if (el.querySelector('[class*="day" i][class*="name" i], [class*="weekday" i]')) return true
    const cells = Array.from(
      el.querySelectorAll('[role="gridcell"], [role="option"], [class*="day" i]'),
    )
    const numeric = cells.filter((c) => /^\d{1,2}$/.test(textOf(c)))
    return numeric.length >= 20
  } catch {
    return false
  }
}

/** Escape a value for use inside an attribute selector's quoted string. */
export function cssEscapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
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

/** The display label of an option: its inner `<label>`, else its text, else aria-label. */
export function optionLabelText(option: Element): string {
  const label = option.querySelector('label')
  const labelText = label ? textOf(label) : ''
  return labelText || textOf(option) || option.getAttribute('aria-label')?.trim() || ''
}

// --- Calendar reading -------------------------------------------------------

export const MONTH_NAMES = [
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

/** Matches "June 2032" / "Jun 2032" — a month name (or abbreviation) plus a year. */
const MONTH_YEAR_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4}\b/i

/**
 * Text of the calendar's month/year header, or null. Prefers a match whose text
 * actually names a month + year — an empty `[aria-live]` region (react-datepicker
 * renders one before the header) or a grid full of day numbers must not shadow the
 * real heading. Custom headers that expose no month/year/title class (e.g. a plain
 * `<p>June 2032</p>`) are found by scanning header containers for a short
 * month+year text node.
 */
export function calendarHeading(doc: Document, widgetEl: Element): string | null {
  const sel =
    '[class*="header" i] [class*="title" i], [class*="month" i][class*="year" i], ' +
    '[class*="current-month" i], [aria-live], .dp__month_year_wrap, ' +
    '.mat-calendar-period-button, [role="grid"]'
  const scopes: ParentNode[] = [widgetEl, doc]
  let fallback: string | null = null
  for (const scope of scopes) {
    for (const el of queryAllIn(scope, sel)) {
      const text = el.getAttribute('aria-label') || textOf(el)
      if (!text) continue
      if (MONTH_YEAR_RE.test(text)) return text
      fallback = fallback ?? text
    }
  }
  for (const scope of scopes) {
    for (const header of queryAllIn(scope, '[class*="header" i]')) {
      for (const el of Array.from(header.querySelectorAll('*')).slice(0, 60)) {
        const text = textOf(el)
        if (text !== '' && text.length <= 40 && MONTH_YEAR_RE.test(text)) return text
      }
    }
  }
  return fallback
}

/** Selector matching candidate day cells across the supported calendar libraries. */
export const DAY_CELL_SELECTOR =
  '[role="gridcell"], .dp__cell_inner, .mat-calendar-body-cell, td[role] button, [class*="day" i]'

/** All candidate day cells, scoped to the widget when it holds the calendar, else the document. */
export function dayCellNodes(doc: Document, widgetEl: Element): Element[] {
  const scope: ParentNode = (
    widgetEl.querySelector(DAY_CELL_SELECTOR) ? widgetEl : doc
  ) as ParentNode
  try {
    return Array.from(scope.querySelectorAll(DAY_CELL_SELECTOR))
  } catch {
    return []
  }
}

export function isDayDisabled(cell: Element): boolean {
  return (
    cell.getAttribute('aria-disabled') === 'true' ||
    (cell as HTMLButtonElement).disabled === true ||
    cell.hasAttribute('disabled') ||
    // "disabled" as a state class ("--disabled", "is-disabled") — but NOT a
    // Tailwind variant prefix ("disabled:text-grey-300"), which sits on ENABLED
    // elements by design.
    /disabled(?!:)/i.test(cell.getAttribute('class') ?? '')
  )
}

export function isAdjacentMonth(cell: Element): boolean {
  return /(other|adjacent|outside|offset|sibling)[-_]?month|dp__cell_offset/i.test(
    cell.getAttribute('class') ?? '',
  )
}

// --- Synthetic clicking -----------------------------------------------------

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
export function clickElement(el: Element, anchor: Element = el): void {
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
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// --- Querying / text --------------------------------------------------------

export function queryIn(scope: ParentNode, selector: string): Element | null {
  try {
    return scope.querySelector(selector)
  } catch {
    return null
  }
}

function queryAllIn(scope: ParentNode, selector: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll(selector))
  } catch {
    return []
  }
}

/** Text content minus SVG/icon noise, whitespace-collapsed. */
export function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element
  for (const svg of Array.from(clone.querySelectorAll('svg'))) svg.remove()
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

// --- Element resolution -----------------------------------------------------

/**
 * Prepend the scanner's stable per-element marker so resolution hits the exact
 * element that was detected. The marker is derived from the field id (the scanner
 * stamps `data-qf-id="<id>"`), never persisted into saved mappings — so it can't
 * pollute cross-scan matching. Falls back to the fuzzy candidates if the marker is
 * gone (e.g. the framework re-rendered the node between scan and fill).
 */
export function markedSelectors(detectedFieldId: string, candidates: string[]): string[] {
  return [`[data-qf-id="${detectedFieldId}"]`, ...candidates]
}

/**
 * First element matching any selector candidate, searched across open shadow roots
 * AND same-origin iframes. Skips elements already claimed by an earlier instruction
 * in the same batch, so a non-unique fuzzy selector can never double-target one
 * element.
 */
export function findElement(
  root: FillRoot,
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
export function frameDocument(el: Element): Document | null {
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
