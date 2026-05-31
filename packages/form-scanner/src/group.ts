import type { DetectedForm, ScanOptions, ScanResult } from '@quikfill/schemas'
import { getAriaLabel, getSectionHeading, getSelectorCandidates, isVisible } from './extract'
import { scanForms } from './scan'

/** A grouped scan: the flat ScanResult plus its fields organized into forms. */
export type GroupedScanResult = ScanResult & { forms: DetectedForm[] }

/** Candidate elements that could act as a form's action button. */
const BUTTONLIKE = 'button, [role="button"], input[type="submit"], input[type="button"]'

/**
 * Buttons that clearly are NOT a form's submit. A short, stable *negative* list is
 * far more robust than trying to enumerate every "submit" verb: there are only a
 * handful of dismiss/secondary words, and they rarely drift. Anything not on this
 * list is treated as a possible primary action.
 */
const DISMISS_RE = /\b(cancel|close|back|dismiss|reset|skip|previous|prev|clear)\b/i

function isDismissAction(el: Element): boolean {
  const text = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`
  return DISMISS_RE.test(text)
}

/**
 * Scan a page and group the detected fields by their owning form. A field's group
 * is, in order: its `<form>` ancestor; else the nearest ancestor that contains a
 * submit-intent button (formless React forms); else the common ancestor of all
 * remaining ungrouped fields. Synthetic group roots are stamped `data-qf-form` so
 * the overlay can re-resolve them. DOM-only — no Chrome, no Vue.
 */
export function scanFormsGrouped(
  root: Document | Element = document,
  options: ScanOptions = { includeHidden: false, scope: 'auto' },
): GroupedScanResult {
  // Clear stale synthetic markers from a prior grouped scan (scanForms already
  // clears data-qf-id, but not data-qf-form).
  for (const stale of Array.from(root.querySelectorAll('[data-qf-form]'))) {
    stale.removeAttribute('data-qf-form')
  }

  const result = scanForms(root, options)
  const elById = collectStamped(root)

  // Resolve each field to (element, group-root element). Fields whose element we
  // can't resolve (shouldn't happen) are dropped from grouping but kept in fields.
  const entries: { id: string; el: Element; frame: string }[] = []
  for (const field of result.fields) {
    const el = elById.get(field.id)
    if (el) entries.push({ id: field.id, el, frame: field.frame })
  }

  const groupRootByField = new Map<string, Element>()
  const ungrouped: { id: string; el: Element; frame: string }[] = []
  for (const entry of entries) {
    const form = entry.el.closest('form')
    if (form) {
      groupRootByField.set(entry.id, form)
      continue
    }
    const submitAncestor = nearestSubmitAncestor(entry.el)
    if (submitAncestor) {
      groupRootByField.set(entry.id, submitAncestor)
      continue
    }
    ungrouped.push(entry)
  }

  // Remaining formless, submit-less fields collapse into one group under their
  // common ancestor so a formless React form without an explicit action still
  // groups instead of fragmenting into one-field groups.
  if (ungrouped.length > 0) {
    const lca = commonAncestor(ungrouped.map((e) => e.el))
    if (lca) for (const e of ungrouped) groupRootByField.set(e.id, lca)
  }

  // Materialize forms in field (= DOM) order, one per distinct group root.
  const forms: DetectedForm[] = []
  const formByRoot = new Map<Element, DetectedForm>()
  let synthetic = 0
  for (const entry of entries) {
    const groupRoot = groupRootByField.get(entry.id)
    if (!groupRoot) continue
    let form = formByRoot.get(groupRoot)
    if (!form) {
      const isRealForm = groupRoot.tagName.toLowerCase() === 'form'
      const formId = isRealForm
        ? groupRoot.getAttribute('id') || `qf-form-${synthetic++}`
        : `qf-form-${synthetic++}`
      // Stamp synthetic group roots (and real forms lacking an id) so the formId
      // resolves back to an element via [data-qf-form="..."].
      if (!isRealForm || !groupRoot.getAttribute('id')) {
        groupRoot.setAttribute('data-qf-form', formId)
      }
      const submit = findSubmitButton(groupRoot)
      form = {
        formId,
        fieldIds: [],
        submitSelectorCandidates: submit ? getSelectorCandidates(submit) : [],
        frame: entry.frame,
        label: formLabel(groupRoot, submit),
      }
      formByRoot.set(groupRoot, form)
      forms.push(form)
    }
    form.fieldIds.push(entry.id)
  }

  return { ...result, forms }
}

/** Collect every element stamped with a data-qf-id, across open shadow roots + same-origin iframes. */
function collectStamped(root: Document | Element): Map<string, Element> {
  const map = new Map<string, Element>()
  const walk = (scope: ParentNode): void => {
    let stamped: Element[]
    try {
      stamped = Array.from(scope.querySelectorAll('[data-qf-id]'))
    } catch {
      stamped = []
    }
    for (const el of stamped) {
      const id = el.getAttribute('data-qf-id')
      if (id && !map.has(id)) map.set(id, el)
    }
    for (const el of Array.from(scope.querySelectorAll('*'))) {
      const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
      if (shadow) walk(shadow)
      if (el.tagName.toLowerCase() === 'iframe') {
        try {
          const doc = (el as HTMLIFrameElement).contentDocument
          if (doc) walk(doc)
        } catch {
          /* cross-origin — not accessible */
        }
      }
    }
  }
  walk(root)
  return map
}

/** The nearest ancestor of a formless field that contains a submit-intent button. */
function nearestSubmitAncestor(el: Element): Element | null {
  let node = el.parentElement
  for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
    if (findSubmitButton(node)) return node
  }
  return null
}

/**
 * The form's action button, detected by HTML semantics + position rather than a
 * word list:
 *  1. An explicit `button[type=submit]` / `input[type=submit]` (or one linked by
 *     `form="<id>"`) — unambiguous.
 *  2. Inside a real `<form>`, a `<button>` with no `type` attribute submits by HTML
 *     spec; take the last such button (the primary action sits at the end).
 *  3. Otherwise (formless groups, or forms whose action is a plain/`type=button`
 *     button driven by JS) the last visible button-like element that is not an
 *     obvious dismiss (Cancel/Close/Back/…).
 * Returns null only when there is no button-like element at all.
 */
export function findSubmitButton(formRoot: Element): Element | null {
  const isForm = formRoot.tagName.toLowerCase() === 'form'

  const explicit = Array.from(
    formRoot.querySelectorAll('button[type="submit"], input[type="submit"]'),
  ).find((el) => isVisible(el))
  if (explicit) return explicit

  // A submit linked to a real form by its `form` attribute may sit outside the form.
  const id = isForm ? formRoot.getAttribute('id') : null
  if (id) {
    const linked = formRoot.ownerDocument?.querySelector(
      `button[type="submit"][form="${cssAttr(id)}"], input[type="submit"][form="${cssAttr(id)}"]`,
    )
    if (linked && isVisible(linked)) return linked
  }

  // A no-type <button> inside a <form> is a submit per spec — last one wins.
  if (isForm) {
    const implicit = Array.from(
      formRoot.querySelectorAll('button:not([type]), button[type="submit"]'),
    ).filter((el) => isVisible(el))
    if (implicit.length > 0) return implicit[implicit.length - 1]
  }

  // Generic fallback: the trailing non-dismiss button-like element is, by
  // convention, the primary action — no positive verb list needed.
  const actions = Array.from(formRoot.querySelectorAll(BUTTONLIKE)).filter(
    (el) => isVisible(el) && !isDismissAction(el),
  )
  return actions.length > 0 ? actions[actions.length - 1] : null
}

/** A human label for the form: aria-label, nearest heading, or submit-button text. */
function formLabel(groupRoot: Element, submit: Element | null): string | undefined {
  const aria = getAriaLabel(groupRoot)
  if (aria) return aria
  const heading = getSectionHeading(groupRoot)
  if (heading) return heading
  const submitText = submit?.textContent?.replace(/\s+/g, ' ').trim()
  return submitText || undefined
}

/** The lowest element that contains every element in the list. */
function commonAncestor(els: Element[]): Element | null {
  if (els.length === 0) return null
  let ancestor: Element | null = els[0]
  for (const el of els.slice(1)) {
    while (ancestor && !ancestor.contains(el)) ancestor = ancestor.parentElement
  }
  return ancestor
}

/** Escape a value for use inside a CSS attribute-selector string literal. */
function cssAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}
