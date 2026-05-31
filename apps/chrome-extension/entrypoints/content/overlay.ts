import { buildAiFillRequest, isNativeFillable, valuesToFillInstructions } from '@quikfill/ai'
import { requestAiFill } from '@quikfill/browser-adapter'
import { applyFill, scanFormsGrouped } from '@quikfill/form-scanner'
import type { DetectedField, DetectedForm } from '@quikfill/schemas'

/** A mounted overlay; call `destroy()` to remove all UI + listeners (SPA teardown/tests). */
export interface OverlayHandle {
  destroy(): void
  /** Force a re-scan now (exposed for tests; normally driven by the observer). */
  rescan(): void
}

const HOST_ID = 'quikfill-overlay-host'
const RESCAN_DEBOUNCE_MS = 300

type ButtonStatus = 'idle' | 'loading' | 'success' | 'error'

interface FormButton {
  groupRoot: Element
  formId: string
  submitEl: Element | null
  el: HTMLButtonElement
  label: HTMLSpanElement
  status: ButtonStatus
}

/**
 * Mount the in-page fill overlay: auto-detect each form, inject an isolated
 * Shadow-DOM floating button near its submit control, and on click collect
 * redacted metadata → /ai/fill → applyFill. Re-detects via a debounced
 * MutationObserver so buttons follow SPA / modal forms. DOM-only feature UI; the
 * backend call is delegated to the background worker via requestAiFill.
 */
export function mountOverlay(doc: Document = document): OverlayHandle {
  const host = doc.createElement('div')
  host.id = HOST_ID
  // Append to <html>, not <body>: keeps our host out of the body-subtree the
  // observer watches, so injecting buttons never re-triggers a scan.
  doc.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = OVERLAY_CSS
  shadow.appendChild(style)

  // form group-root element → its button. Keyed by element identity so a re-scan
  // reconciles against live DOM rather than the positional formId.
  const buttons = new Map<Element, FormButton>()

  function scan(): void {
    let result: ReturnType<typeof scanFormsGrouped>
    try {
      result = scanFormsGrouped(doc)
    } catch {
      return
    }
    const fieldById = new Map<string, DetectedField>(result.fields.map((f) => [f.id, f]))
    const seen = new Set<Element>()

    for (const form of result.forms) {
      const groupRoot = resolveGroupRoot(form, fieldById, doc)
      if (!groupRoot) continue
      // Native inputs only — skip forms whose detectable fields are all custom.
      const hasNative = form.fieldIds.some((id) => {
        const f = fieldById.get(id)
        return f ? isNativeFillable(f) : false
      })
      if (!hasNative) continue
      const submitEl = resolveSubmit(form, groupRoot, doc)
      // No anchor → no button (open question §10.1: skip forms with no submit).
      if (!submitEl) continue

      seen.add(groupRoot)
      const existing = buttons.get(groupRoot)
      if (existing) {
        existing.submitEl = submitEl
        existing.formId = form.formId
      } else {
        buttons.set(groupRoot, createButton(groupRoot, form.formId, submitEl, shadow, doc))
      }
    }

    // Drop buttons whose form is gone / no longer qualifies.
    for (const [root, button] of buttons) {
      if (!seen.has(root) || !root.isConnected) {
        button.el.remove()
        buttons.delete(root)
      }
    }
    reposition()
  }

  function createButton(
    groupRoot: Element,
    formId: string,
    submitEl: Element,
    shadowRoot: ShadowRoot,
    ownerDoc: Document,
  ): FormButton {
    const el = ownerDoc.createElement('button')
    el.type = 'button'
    el.className = 'qf-fill-btn'
    el.setAttribute('aria-label', 'Fill this form with QuikFill')
    const mark = ownerDoc.createElement('span')
    mark.className = 'qf-mark'
    mark.textContent = 'Q'
    const label = ownerDoc.createElement('span')
    label.className = 'qf-label'
    label.textContent = 'Fill'
    el.append(mark, label)
    const button: FormButton = { groupRoot, formId, submitEl, el, label, status: 'idle' }
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void onFill(button)
    })
    shadowRoot.appendChild(el)
    return button
  }

  async function onFill(button: FormButton): Promise<void> {
    if (button.status === 'loading') return
    setStatus(button, 'loading')

    // Re-scan for fresh fields (the DOM may have changed since injection).
    let result: ReturnType<typeof scanFormsGrouped>
    try {
      result = scanFormsGrouped(doc)
    } catch {
      setStatus(button, 'error')
      return
    }
    const fieldById = new Map<string, DetectedField>(result.fields.map((f) => [f.id, f]))
    const form =
      result.forms.find((f) => resolveGroupRoot(f, fieldById, doc) === button.groupRoot) ??
      result.forms.find((f) => f.formId === button.formId)
    if (!form) {
      setStatus(button, 'error')
      return
    }

    const fields = form.fieldIds
      .map((id) => fieldById.get(id))
      .filter((f): f is DetectedField => !!f && isNativeFillable(f))
    if (fields.length === 0) {
      setStatus(button, 'error')
      return
    }

    const request = buildAiFillRequest(pageGlobals(doc), fields)
    const reply = await requestAiFill(request)
    if (!reply.ok) {
      setStatus(button, 'error')
      return
    }

    const instructions = valuesToFillInstructions(reply.response.values, fields)
    if (instructions.length === 0) {
      setStatus(button, 'error')
      return
    }
    try {
      const outcome = await applyFill(instructions, doc)
      const anyFilled = outcome.results.some(
        (r) => r.status === 'success' || r.status === 'assisted',
      )
      setStatus(button, anyFilled ? 'success' : 'error')
    } catch {
      setStatus(button, 'error')
    }
  }

  function setStatus(button: FormButton, status: ButtonStatus): void {
    button.status = status
    button.el.classList.remove('is-loading', 'is-success', 'is-error')
    if (status === 'loading') {
      button.el.classList.add('is-loading')
      button.label.textContent = 'Filling…'
    } else if (status === 'success') {
      button.el.classList.add('is-success')
      button.label.textContent = 'Filled'
    } else if (status === 'error') {
      button.el.classList.add('is-error')
      button.label.textContent = 'Try again'
    } else {
      button.label.textContent = 'Fill'
    }
    // Auto-return success/error to idle so the button is reusable.
    if (status === 'success' || status === 'error') {
      win.setTimeout(() => {
        if (button.status === status) setStatus(button, 'idle')
      }, 2500)
    }
  }

  function reposition(): void {
    for (const button of buttons.values()) {
      const anchor = button.submitEl
      if (!anchor || !anchor.isConnected) {
        button.el.style.display = 'none'
        continue
      }
      const rect = anchor.getBoundingClientRect()
      // Hidden / zero-box anchor (e.g. inside a closed tab) → hide the button.
      if (rect.width === 0 && rect.height === 0) {
        button.el.style.display = 'none'
        continue
      }
      button.el.style.display = ''
      // Anchor to the submit button's top-right corner, nudged just outside it.
      const top = rect.top + win.scrollY - 4
      const left = rect.right + win.scrollX + 8
      button.el.style.top = `${Math.max(4, top)}px`
      button.el.style.left = `${left}px`
    }
  }

  const win = doc.defaultView ?? window

  // Debounced re-scan on DOM changes. childList+subtree only (NOT attributes) so
  // the scanner's own data-qf-id / data-qf-form stamping can't feed the loop.
  let debounce: number | undefined
  const observer = new MutationObserver(() => {
    if (debounce) win.clearTimeout(debounce)
    debounce = win.setTimeout(scan, RESCAN_DEBOUNCE_MS)
  })
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true })

  const onScrollResize = (): void => reposition()
  win.addEventListener('scroll', onScrollResize, { passive: true, capture: true })
  win.addEventListener('resize', onScrollResize, { passive: true })

  scan()

  return {
    rescan: scan,
    destroy() {
      observer.disconnect()
      if (debounce) win.clearTimeout(debounce)
      win.removeEventListener('scroll', onScrollResize, { capture: true } as EventListenerOptions)
      win.removeEventListener('resize', onScrollResize)
      host.remove()
      buttons.clear()
    },
  }
}

/** Resolve a form's group-root element via its first field, climbing to form/[data-qf-form]. */
function resolveGroupRoot(
  form: DetectedForm,
  fieldById: Map<string, DetectedField>,
  doc: Document,
): Element | null {
  for (const id of form.fieldIds) {
    if (!fieldById.has(id)) continue
    const el = doc.querySelector(`[data-qf-id="${cssAttr(id)}"]`)
    const root = el?.closest('form, [data-qf-form]')
    if (root) return root
  }
  // Synthetic group roots are stamped data-qf-form even when they hold no <form>.
  return doc.querySelector(`[data-qf-form="${cssAttr(form.formId)}"]`)
}

/** Resolve the submit element from the form's candidates, preferring one inside the group root. */
function resolveSubmit(form: DetectedForm, groupRoot: Element, doc: Document): Element | null {
  // Prefer a match inside the group root, then anywhere in the document.
  for (const scope of [groupRoot, doc]) {
    for (const selector of form.submitSelectorCandidates) {
      try {
        const match = scope.querySelector(selector)
        if (match) return match
      } catch {
        /* invalid selector — skip */
      }
    }
  }
  return null
}

/** Page globals — language, title, meta description. Never any HTML. */
function pageGlobals(doc: Document): { lang: string; title: string; description: string } {
  return {
    lang: doc.documentElement.getAttribute('lang') ?? '',
    title: doc.title ?? '',
    description: doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  }
}

/** Escape a value for a CSS attribute-selector string literal. */
function cssAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

const OVERLAY_CSS = `
:host { all: initial; }
.qf-fill-btn {
  position: absolute;
  z-index: 2147483646;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 9999px;
  background: #3056d3;
  color: #ffffff;
  font: 600 12px/1 system-ui, -apple-system, Segoe UI, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(48, 86, 211, 0.35);
  max-width: 28px;
  overflow: hidden;
  transition: max-width 0.18s ease, background 0.15s ease;
  white-space: nowrap;
}
.qf-fill-btn:hover,
.qf-fill-btn.is-loading,
.qf-fill-btn.is-success,
.qf-fill-btn.is-error { max-width: 160px; }
.qf-fill-btn:hover { background: #2544c0; }
.qf-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  flex: 0 0 auto;
  font-weight: 800;
}
.qf-label { padding-right: 4px; }
.qf-fill-btn.is-success { background: #13c296; }
.qf-fill-btn.is-error { background: #e11d48; }
.qf-fill-btn.is-loading { opacity: 0.85; cursor: default; }
`
