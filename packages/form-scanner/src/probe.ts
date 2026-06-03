import type { DetectedField, FieldOption } from '@quikfill/schemas'
import { getSelectorCandidates, looksLikeDatepickerInput } from './extract'
import {
  calendarHeading,
  clickElement,
  cssEscapeAttr,
  dayCellNodes,
  dispatchKey,
  findElement,
  isAdjacentMonth,
  isDayDisabled,
  looksLikeCalendar,
  markedSelectors,
  MONTH_NAMES,
  norm,
  openOptionNodes,
  optionLabelText,
  ownerDocOf,
  repeatingSiblingOptions,
  resolveTrigger,
  textOf,
  type FillRoot,
} from './widget-dom'

/**
 * Scan-time widget probe. The scanner detects on-demand custom selects with their
 * option list still CLOSED, so it knows the widget exists but not what its options
 * are — and an AI asked to fill a dropdown without its options invents labels that
 * don't exist. The probe closes that gap by briefly driving each widget the way a
 * user would: open it, wait for the list, harvest the option labels, close it.
 *
 * - A list that renders options → `field.options` is filled and
 *   `customWidget.optionsProbed` set: the caller can pick from the REAL value set.
 * - A list that never produces options within the budget (async/remote fetch, or a
 *   spinner/empty state) → `customWidget.remoteOptions` set: the field is left
 *   blank rather than guessed at.
 * - A text input that opens a calendar (a datepicker whose closed DOM is just an
 *   `<input placeholder="mm / dd / yyyy">`) → gains a `customWidget` descriptor of
 *   kind `datepicker` plus the calendar's `min`/`max` range, so the filler can
 *   type-or-click a date the picker will actually accept.
 *
 * Mutates the passed fields in place. Sequential (one widget open at a time),
 * per-widget try/catch and time budget — a single hostile widget can neither hang
 * nor abort the pass. Probing visibly flashes widgets open, so callers run it only
 * on an explicit fill action, never on passive scans.
 */
export async function probeFields(
  fields: DetectedField[],
  root: FillRoot = document,
): Promise<void> {
  for (const field of fields) {
    try {
      if (isProbeableSelect(field)) {
        await probeSelect(field, root)
      } else if (isDatepickerCandidateField(field)) {
        await probeDatepicker(field, root)
      }
    } catch {
      /* a single bad widget never aborts the probe pass */
    }
  }
}

/** How long one widget may take to render its options/calendar before we move on. */
const PROBE_BUDGET_MS = 600
/** Poll cadence while waiting on a widget. */
const PROBE_TICK_MS = 50

/** Rows that are list chrome (loading/empty/prompt states), not pickable values. */
const NON_OPTION_TEXT_RE =
  /^(loading|searching|fetching|please wait|no (results|options|matches|data)|select|choose|please choose|pick)\b/i

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Custom select probing --------------------------------------------------

/** A detected custom select whose option list the scan could not see (closed). */
function isProbeableSelect(field: DetectedField): boolean {
  const widget = field.customWidget
  if (!widget || (widget.kind !== 'select' && widget.kind !== 'multiselect')) return false
  if (widget.remoteOptions || widget.optionsProbed) return false // probed already
  return !field.options || field.options.length === 0
}

async function probeSelect(field: DetectedField, root: FillRoot): Promise<void> {
  const widget = field.customWidget
  if (!widget) return
  const widgetEl = findElement(root, markedSelectors(field.id, field.selectorCandidates))
  if (!widgetEl) return
  const doc = ownerDocOf(widgetEl)
  const trigger = resolveTrigger(widgetEl)

  // Record what the open click ADDS to the DOM — for widgets with zero ARIA and no
  // list structure, the appeared subtree itself is the only signal of where the
  // options live (the user-visible "what changed when I clicked?").
  const added: Element[] = []
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) added.push(node as Element)
      }
    }
  })
  observe(observer, doc)

  let opened = false
  let rows = harvestableRows(openOptionNodes(widget, widgetEl, trigger, doc))
  let via: 'selector' | 'diff' = 'selector'
  if (rows.length === 0) {
    clickElement(trigger)
    opened = true
    const found = await waitForOptions(field, widgetEl, trigger, doc, added)
    rows = found.rows
    via = found.via
  }
  observer.disconnect()

  if (rows.length > 0) {
    field.options = harvestOptions(rows, field.currentValue)
    widget.optionsProbed = true
    // Durable rediscovery hints for fill time: the rows unmount when the list
    // closes, so the fill must FIND them again — give it the strongest handles the
    // open list exposed.
    const wrapper = rows[0].parentElement
    if (wrapper?.id && !widget.listboxId) widget.listboxId = wrapper.id
    if (via === 'diff') {
      const derived = deriveOptionSelector(rows)
      if (derived) widget.optionItemSelector = `${derived}, ${widget.optionItemSelector}`
    }
  } else {
    // Nothing rendered within the budget: a remote/async list (or an empty one).
    // Per product decision the field is left blank — never guessed at.
    widget.remoteOptions = true
  }

  if (opened) await closeWidget(field, widgetEl, trigger, doc)
}

/** Poll for option rows: the shared discovery tiers first, then the mutation diff. */
async function waitForOptions(
  field: DetectedField,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
  added: Element[],
): Promise<{ rows: Element[]; via: 'selector' | 'diff' }> {
  const widget = field.customWidget
  if (!widget) return { rows: [], via: 'selector' }
  const deadline = Date.now() + PROBE_BUDGET_MS
  for (;;) {
    const bySelector = harvestableRows(openOptionNodes(widget, widgetEl, trigger, doc))
    if (bySelector.length > 0) return { rows: bySelector, via: 'selector' }
    const byDiff = harvestableRows(diffOptions(added, trigger))
    if (byDiff.length > 0) return { rows: byDiff, via: 'diff' }
    if (Date.now() >= deadline) return { rows: [], via: 'selector' }
    await delay(PROBE_TICK_MS)
  }
}

/**
 * The options wrapper among the subtrees the open click added: the container whose
 * children are the largest group of repeating similar, clickable, short-text rows.
 * Calendars are excluded — a day grid repeats too, but it is a datepicker.
 */
function diffOptions(added: Element[], trigger: Element): Element[] {
  const scopes = new Set<Element>()
  for (const el of added) {
    if (!el.isConnected || el === trigger || trigger.contains(el)) continue
    scopes.add(el)
    // The click may append rows ONE BY ONE — then each added node is a row, and the
    // repeating group only shows on its parent.
    if (el.parentElement) scopes.add(el.parentElement)
  }
  let best: Element[] = []
  for (const scope of scopes) {
    if (looksLikeCalendar(scope)) continue
    const rows = repeatingSiblingOptions(scope, trigger)
    if (rows.length > best.length) best = rows
  }
  return best
}

/** Drop chrome rows (loading/empty/prompt states) — only real values are options. */
function harvestableRows(rows: Element[]): Element[] {
  return rows.filter((row) => {
    const label = optionLabelText(row)
    return label !== '' && !NON_OPTION_TEXT_RE.test(label)
  })
}

/** Option rows → FieldOptions (deduped labels, current selection marked). */
function harvestOptions(rows: Element[], currentValue: string | null | undefined): FieldOption[] {
  const seen = new Set<string>()
  const options: FieldOption[] = []
  for (const row of rows) {
    const label = optionLabelText(row)
    const key = norm(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    options.push({ value: label, label, selected: norm(currentValue ?? '') === key })
  }
  return options
}

/**
 * A durable selector for diff-discovered rows (they carry no ARIA, so the default
 * option selector can't re-find them at fill time): exact tag + class signature,
 * shared by every row. Null when the rows don't share one stable signature.
 */
function deriveOptionSelector(rows: Element[]): string | null {
  const tag = rows[0].tagName.toLowerCase()
  const cls = rows[0].getAttribute('class')
  if (!cls) return null
  const uniform = rows.every(
    (r) => r.tagName.toLowerCase() === tag && r.getAttribute('class') === cls,
  )
  return uniform ? `${tag}[class="${cssEscapeAttr(cls)}"]` : null
}

/**
 * Close a widget the probe opened. A trigger re-press toggles most dropdowns
 * closed; widgets that only close on selection get an Escape on the open list as
 * a fallback. If it STILL stays open we leave it — the fill's open-state guard
 * detects an already-open list and skips its own trigger press, so a stubborn
 * widget costs a moment of flicker, not a broken fill.
 */
async function closeWidget(
  field: DetectedField,
  widgetEl: Element,
  trigger: Element,
  doc: Document,
): Promise<void> {
  const widget = field.customWidget
  if (!widget) return
  const isOpen = (): boolean =>
    trigger.getAttribute('aria-expanded') === 'true' ||
    openOptionNodes(widget, widgetEl, trigger, doc).length > 0
  clickElement(trigger)
  await delay(PROBE_TICK_MS)
  if (!isOpen()) return
  dispatchKey(trigger, 'keydown', 'Escape')
  dispatchKey(trigger, 'keyup', 'Escape')
  await delay(PROBE_TICK_MS)
}

// --- Datepicker probing ------------------------------------------------------

/**
 * Static (field-metadata) pre-filter: a visible, enabled text `<input>` with no widget
 * descriptor yet is worth probing. Read-only is allowed — calendar widgets make their
 * input read-only (you pick from the popup, never type). The real date test (a
 * date-format placeholder or a datepicker-ish container class) runs on the live element
 * in the DOM phase, via `looksLikeDatepickerInput`.
 */
function isDatepickerCandidateField(field: DetectedField): boolean {
  if (field.customWidget || field.tagName !== 'input') return false
  if (field.inputType !== 'text') return false // native date inputs need no probe
  return !field.disabled && field.visible
}

async function probeDatepicker(field: DetectedField, root: FillRoot): Promise<void> {
  const el = findElement(root, markedSelectors(field.id, field.selectorCandidates))
  if (!el || el.tagName.toLowerCase() !== 'input') return
  if (!looksLikeDatepickerInput(el)) return
  const doc = ownerDocOf(el)

  const added: Element[] = []
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === 1) added.push(node as Element)
      }
    }
  })
  observe(observer, doc)
  clickElement(el) // focus + click — how calendar inputs open their popup
  const calendar = await waitForCalendar(added)
  observer.disconnect()
  if (!calendar) return // never opened a calendar — it's just a text input

  // Read the calendar's allowed range so the AI proposes a date the picker will
  // actually accept (e.g. a "paid through" picker whose min is years away).
  const range = readCalendarRange(doc, calendar)
  if (range.min && !field.min) field.min = range.min
  if (range.max && !field.max) field.max = range.max

  // The descriptor routes this field through the datepicker fill path: type the
  // date first, fall back to navigating the calendar and clicking the day cell.
  field.customWidget = {
    kind: 'datepicker',
    triggerSelectorCandidates: getSelectorCandidates(el),
    valueDisplaySelectorCandidates: [],
    optionItemSelector: '[role="option"], [role="gridcell"]',
    optionsOpenOnDemand: true,
    isSearchable: false,
    isVirtualized: false,
  }

  // Escape is the calendar-close convention (react-datepicker, MUI, …). A calendar
  // that ignores it stays open — harmless, the fill drives it open anyway.
  dispatchKey(el, 'keydown', 'Escape')
  dispatchKey(el, 'keyup', 'Escape')
  await delay(PROBE_TICK_MS)
}

/** Poll the added subtrees for one that reads as a calendar. */
async function waitForCalendar(added: Element[]): Promise<Element | null> {
  const deadline = Date.now() + PROBE_BUDGET_MS
  for (;;) {
    for (const el of added) {
      if (el.isConnected && looksLikeCalendar(el)) return el
    }
    if (Date.now() >= deadline) return null
    await delay(PROBE_TICK_MS)
  }
}

/**
 * The calendar's reachable date range, read from its open month. Only a range edge
 * the calendar PROVES is reported: when the prev-month nav is missing/disabled, the
 * first enabled day of the visible month is the minimum (analogously for max). A
 * calendar that can page further has an unknown range — nothing is claimed.
 */
function readCalendarRange(doc: Document, calendar: Element): { min?: string; max?: string } {
  const parsed = parseMonthYear(calendarHeading(doc, calendar))
  if (!parsed) return {}
  const days = dayCellNodes(doc, calendar)
    .filter((c) => !isAdjacentMonth(c) && !isDayDisabled(c))
    .map((c) => Number(norm(textOf(c))))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
  if (days.length === 0) return {}
  const out: { min?: string; max?: string } = {}
  if (navMissingOrDisabled(calendar, 'prev')) {
    out.min = isoDate(parsed.year, parsed.month, Math.min(...days))
  }
  if (navMissingOrDisabled(calendar, 'next')) {
    out.max = isoDate(parsed.year, parsed.month, Math.max(...days))
  }
  return out
}

/** Month + year parsed from a heading like "June 2032" (3-letter abbreviations OK). */
function parseMonthYear(heading: string | null): { year: number; month: number } | null {
  if (!heading) return null
  const h = norm(heading)
  const month = MONTH_NAMES.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}`).test(h))
  const year = Number((/\b(\d{4})\b/.exec(h) ?? [])[1])
  if (month < 0 || !Number.isFinite(year)) return null
  return { year, month }
}

/** Whether the calendar's prev/next month nav is absent or disabled (a range edge). */
function navMissingOrDisabled(calendar: Element, dir: 'prev' | 'next'): boolean {
  const sel =
    dir === 'prev'
      ? '[aria-label*="prev" i], [data-test-id*="prev" i], [data-testid*="prev" i], [class*="prev" i]'
      : '[aria-label*="next" i], [data-test-id*="next" i], [data-testid*="next" i], [class*="next" i]'
  let matches: Element[]
  try {
    matches = Array.from(calendar.querySelectorAll(sel))
  } catch {
    return false
  }
  if (matches.length === 0) return true
  return matches.every((m) => isDayDisabled(m))
}

function isoDate(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Observe a document for added nodes; tolerates a not-yet-parsed documentElement. */
function observe(observer: MutationObserver, doc: Document): void {
  try {
    observer.observe(doc.documentElement ?? doc, { childList: true, subtree: true })
  } catch {
    /* detached/odd documents — the selector tiers still run without the diff */
  }
}
