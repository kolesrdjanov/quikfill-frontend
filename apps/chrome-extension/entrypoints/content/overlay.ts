import { buildAiFillRequest, isFillableField, valuesToFillInstructions } from '@quikfill/ai'
import {
  onEntitlementsChange,
  refreshEntitlements,
  requestAiFill,
  requestEntitlements,
  type AiClassifyReason,
} from '@quikfill/browser-adapter'
import {
  applyFill,
  isOccludingHit,
  qualifiesForFill,
  scanFormsGrouped,
} from '@quikfill/form-scanner'
import {
  isOverQuota,
  type DetectedField,
  type DetectedForm,
  type Entitlements,
} from '@quikfill/schemas'

/**
 * User-facing copy per AI failure cause (mirrors lib/display-maps `AI_REASON_MESSAGE`;
 * duplicated here so the content script doesn't pull in Vue/lucide). `label` shows
 * in the pill, `title` is the hover tooltip.
 */
const ERROR_COPY: Record<AiClassifyReason, { label: string; title: string }> = {
  quota: {
    label: 'AI limit reached',
    title: 'You’ve reached this month’s AI limit — it resets next month.',
  },
  'rate-limited': {
    label: 'Slow down',
    title: 'Too many AI requests just now — wait a moment and try again.',
  },
  auth: { label: 'Sign in again', title: 'Your session expired — sign in again to use AI.' },
  'not-configured': {
    label: 'AI unavailable',
    title: 'QuikFill AI isn’t enabled on the server right now.',
  },
  offline: {
    label: 'Offline',
    title: 'QuikFill AI is unreachable. Check your connection and try again.',
  },
  error: { label: 'Try again', title: 'QuikFill AI hit an unexpected error.' },
}

/** A mounted overlay; call `destroy()` to remove all UI + listeners (SPA teardown/tests). */
export interface OverlayHandle {
  destroy(): void
  /** Force a re-scan now (exposed for tests; normally driven by the observer). */
  rescan(): void
}

const HOST_ID = 'quikfill-overlay-host'
const RESCAN_DEBOUNCE_MS = 300

// TEMPORARY fill diagnostics. Logged in two places so they're visible regardless
// of which DevTools you have open: the filled tab's PAGE console (direct), and the
// background service-worker console (mirrored — that's where the /ai/fill POST
// shows). Remove once the drawer-close culprit is pinned.
const qfDebug = (...args: unknown[]): void => {
  const g = globalThis as unknown as { console?: Record<string, (...a: unknown[]) => void> }
  g.console?.['log']?.('[QuikFill]', ...args)
  try {
    void chrome.runtime?.sendMessage?.({ type: 'QF_DEBUG', args })?.catch?.(() => {})
  } catch {
    /* extension context torn down — ignore */
  }
}

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

  // The on-page button is the AI-budget signal: it appears only while the user has
  // budget. Over-quota → no button (all usage detail lives in the side panel).
  // Unknown entitlements (null) are treated optimistically — show the button — to
  // match the surfaces; an actual over-budget click then fails with "AI limit
  // reached" and refreshes the snapshot, which hides the button.
  let overQuota = false
  const applyEntitlements = (e: Entitlements | null): void => {
    overQuota = e !== null && isOverQuota(e.tokensUsed, e.tokenLimit)
  }

  function removeAllButtons(): void {
    for (const [root, button] of buttons) {
      button.el.remove()
      buttons.delete(root)
    }
  }

  function scan(): void {
    if (overQuota) {
      removeAllButtons()
      return
    }
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
      // Fillable fields = native inputs + detected custom selects. A form must clear
      // the MIN_FILLABLE_FIELDS floor (qualifiesForFill) to earn a button: this skips
      // button-only forms (0), single-input search boxes (1), and 2-input forms
      // (incl. email+password logins) so we only decorate substantial forms.
      const fillableIds = form.fieldIds.filter((id) => {
        const f = fieldById.get(id)
        return f ? isFillableField(f) : false
      })
      if (!qualifiesForFill(fillableIds.length)) continue

      // The submit button only POSITIONS the button — it no longer gates whether a
      // form qualifies. Anchor to the submit, else the last fillable field, else the
      // group root.
      const submitEl = resolveSubmit(form, groupRoot, doc)
      const anchor =
        submitEl ?? resolveFieldEl(fillableIds[fillableIds.length - 1], doc) ?? groupRoot

      seen.add(groupRoot)
      const existing = buttons.get(groupRoot)
      if (existing) {
        existing.submitEl = anchor
        existing.formId = form.formId
      } else {
        buttons.set(groupRoot, createButton(groupRoot, form.formId, anchor, shadow, doc))
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
    // Inline the brand glyph (decorative — the button itself carries the aria-label).
    // The button's own gradient surface is the tile, so the glyph sits straight on it.
    mark.innerHTML = QUIKFILL_GLYPH_SVG
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
      .filter((f): f is DetectedField => !!f && isFillableField(f))
    if (fields.length === 0) {
      setStatus(button, 'error')
      return
    }

    const request = buildAiFillRequest(pageGlobals(doc), fields)
    const reply = await requestAiFill(request)
    if (!reply.ok) {
      // Surface the mapped cause (quota / rate-limit / auth / …) instead of a flat
      // "Try again", so a 429 QUOTA_EXCEEDED reads as "AI limit reached".
      setStatus(button, 'error', ERROR_COPY[reply.reason])
      // A fill that tipped the user over budget: refresh the snapshot so the
      // buttons disappear (the side panel shows the depleted budget).
      if (reply.reason === 'quota') {
        void refreshEntitlements().then((e) => {
          applyEntitlements(e)
          scan()
        })
      }
      return
    }

    const instructions = valuesToFillInstructions(reply.response.values, fields)
    if (instructions.length === 0) {
      setStatus(button, 'error')
      return
    }
    // TEMPORARY diagnostics (unconditional console.log — content bundles strip
    // import.meta.env.DEV, and console.debug is hidden by default). Shows the
    // per-field plan + outcome in the page console so we can see fill ordering and
    // which field's fill coincides with the host modal dismissing. Remove once the
    // close culprit is found.
    qfDebug(
      'applying fill →',
      instructions.map((i) => ({ id: i.detectedFieldId, strategy: i.fillStrategy })),
    )
    try {
      const outcome = await applyFill(instructions, doc)
      qfDebug(
        'fill results →',
        outcome.results.map((r) => ({
          id: r.detectedFieldId,
          status: r.status,
          reason: r.reason,
        })),
      )
      // TEMPORARY: pinpoint WHEN the host modal closes — is the form already
      // detached the instant the fill finishes (closed during the fill), or does it
      // vanish a moment later (closed by the left-open dropdown / an async dismiss)?
      qfDebug('drawer connected right after fill?', button.groupRoot.isConnected)
      setTimeout(
        () => qfDebug('drawer connected 300ms after fill?', button.groupRoot.isConnected),
        300,
      )
      const anyFilled = outcome.results.some(
        (r) => r.status === 'success' || r.status === 'assisted',
      )
      setStatus(button, anyFilled ? 'success' : 'error')
    } catch (err) {
      qfDebug('fill threw →', err)
      setStatus(button, 'error')
    }
  }

  function setStatus(
    button: FormButton,
    status: ButtonStatus,
    error?: { label: string; title?: string },
  ): void {
    button.status = status
    button.el.classList.remove('is-loading', 'is-success', 'is-error')
    if (status !== 'error') button.el.removeAttribute('title')
    if (status === 'loading') {
      button.el.classList.add('is-loading')
      button.label.textContent = 'Filling…'
    } else if (status === 'success') {
      button.el.classList.add('is-success')
      button.label.textContent = 'Filled'
    } else if (status === 'error') {
      button.el.classList.add('is-error')
      button.label.textContent = error?.label ?? 'Try again'
      if (error?.title) button.el.setAttribute('title', error.title)
    } else {
      button.label.textContent = 'Fill'
    }
    // Auto-return to idle so the button is reusable; let an error linger longer so
    // an actionable message (e.g. "AI limit reached") is readable before it clears.
    if (status === 'success' || status === 'error') {
      win.setTimeout(
        () => {
          if (button.status === status) setStatus(button, 'idle')
        },
        status === 'error' ? 5000 : 2500,
      )
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
      // Occlusion guard: a drawer/modal/sticky element now covering the anchor makes
      // a hit-test at its centre return that element (or null when scrolled off).
      // Hide the button so it can't float on top of an overlay that sits above the
      // form. Our own host is ignored, so the button never hides itself. When the
      // drawer closes, the resulting DOM mutation re-scans → reposition → it returns.
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      if (isOccludingHit(anchor, host, doc.elementFromPoint(cx, cy))) {
        button.el.style.display = 'none'
        continue
      }
      button.el.style.display = ''
      // The button is `position: fixed`, so we use viewport coordinates directly
      // (no scroll offset). This keeps it glued whether the anchor lives in normal
      // flow or in a `position: fixed` modal/drawer — re-anchoring on scroll/resize
      // recomputes the rect either way. Clamp into the viewport so it never sits
      // off-screen to the right of a near-edge submit button.
      const vw = win.innerWidth || doc.documentElement.clientWidth
      const top = Math.max(4, rect.top - 4)
      const left = Math.min(rect.right + 8, vw - 170)
      button.el.style.top = `${top}px`
      button.el.style.left = `${Math.max(4, left)}px`
    }
  }

  const win = doc.defaultView ?? window

  // Debounced re-scan on DOM changes. childList+subtree only (NOT attributes) so
  // the scanner's own data-qf-id / data-qf-form stamping can't feed the loop.
  let debounce: number | undefined
  const scheduleScan = (): void => {
    if (debounce) win.clearTimeout(debounce)
    debounce = win.setTimeout(scan, RESCAN_DEBOUNCE_MS)
  }
  const observer = new MutationObserver(scheduleScan)
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true })

  // Safety net for forms the childList observer can't see open: a modal/drawer
  // that is pre-rendered and merely toggled via CSS fires no node insertion, so
  // re-scan when the user focuses any field — by then it is visible and scannable.
  const onFocusIn = (): void => scheduleScan()
  doc.addEventListener('focusin', onFocusIn, true)

  const onScrollResize = (): void => reposition()
  win.addEventListener('scroll', onScrollResize, { passive: true, capture: true })
  win.addEventListener('resize', onScrollResize, { passive: true })

  // Modals/drawers that "close on outside click" treat an event on our button —
  // which lives in a host on <html>, outside their subtree — as an outside click
  // and dismiss themselves. The overlay mounts at document_idle, BEFORE any modal
  // opens, so this capture-phase guard runs ahead of the modal's dismiss listener:
  // when an event originates from our host we stop it propagating, so no dismiss
  // fires. preventDefault on mousedown keeps focus in the modal (focus-out dismiss).
  // We must also swallow `click`: some modals dismiss on a CAPTURE-phase outside
  // click, which fires on document before the event ever reaches our button's own
  // (bubble-phase) handler — so the modal closes and the fill never runs. Stopping
  // the click here would skip that handler, so we re-activate the pressed button.
  const swallowFromHost = (e: Event): void => {
    const path = (e.composedPath?.() ?? []) as EventTarget[]
    if (!path.includes(host)) return
    e.stopImmediatePropagation()
    if (e.type === 'mousedown') e.preventDefault()
    if (e.type === 'click') {
      const pressed = [...buttons.values()].find((b) => path.includes(b.el))
      if (pressed) void onFill(pressed)
    }
  }
  const SWALLOWED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const
  for (const type of SWALLOWED) win.addEventListener(type, swallowFromHost, true)

  // Seed the AI-budget gate from the background and stay in sync: a usage bump,
  // plan change, or monthly reset flips the buttons on/off without a page reload.
  void requestEntitlements().then((e) => {
    applyEntitlements(e)
    scan()
  })
  const unsubscribeEntitlements = onEntitlementsChange((e) => {
    applyEntitlements(e)
    scan()
  })

  scan()

  return {
    rescan: scan,
    destroy() {
      observer.disconnect()
      if (debounce) win.clearTimeout(debounce)
      doc.removeEventListener('focusin', onFocusIn, true)
      for (const type of SWALLOWED) win.removeEventListener(type, swallowFromHost, true)
      win.removeEventListener('scroll', onScrollResize, { capture: true } as EventListenerOptions)
      win.removeEventListener('resize', onScrollResize)
      unsubscribeEntitlements()
      host.remove()
      buttons.clear()
    },
  }
}

/** Resolve a field's element by its data-qf-id within the document. */
function resolveFieldEl(id: string, doc: Document): Element | null {
  return doc.querySelector(`[data-qf-id="${cssAttr(id)}"]`)
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
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 9px;
  background: linear-gradient(135deg, #3f66e0, #2544c0);
  color: #ffffff;
  font: 600 12.5px/1 system-ui, -apple-system, Segoe UI, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(37, 68, 192, 0.32);
  overflow: hidden;
  white-space: nowrap;
  /* Animate ONLY interpolable properties — never width:auto or transform, which
     snap/jump rather than ease. The button is content-sized: it grows into a pill
     because the LABEL's max-width eases open and the button reflows to follow it.
     padding-left stays fixed so the glyph never drifts; depth comes from the
     shadow, not a translate, so the button never moves. */
  transition:
    padding 0.18s ease,
    border-radius 0.18s ease,
    box-shadow 0.18s ease,
    background 0.15s ease;
}
.qf-fill-btn:hover,
.qf-fill-btn.is-loading,
.qf-fill-btn.is-success,
.qf-fill-btn.is-error {
  padding: 0 12px 0 6px;
  border-radius: 15px;
  box-shadow: 0 5px 14px rgba(37, 68, 192, 0.4);
}
.qf-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
.qf-mark svg { width: 18px; height: 18px; display: block; }
.qf-label {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-width 0.18s ease,
    margin-left 0.18s ease,
    opacity 0.15s ease;
}
.qf-fill-btn:hover .qf-label,
.qf-fill-btn.is-loading .qf-label,
.qf-fill-btn.is-success .qf-label,
.qf-fill-btn.is-error .qf-label {
  max-width: 130px;
  margin-left: 6px;
  opacity: 1;
}
.qf-fill-btn.is-success { background: #13c296; box-shadow: 0 5px 14px rgba(19, 194, 150, 0.4); }
.qf-fill-btn.is-error { background: #e11d48; box-shadow: 0 5px 14px rgba(225, 29, 72, 0.4); }
.qf-fill-btn.is-loading { opacity: 0.9; cursor: default; }
`

/**
 * The QuikFill glyph — the lightning bolt + green "spark" dot, WITHOUT the brand
 * tile's background rect/gradient. The button's own gradient surface IS the tile, so
 * the glyph sits straight on it (no nested square, no clipped seam). White bolt on
 * the blue surface; the dot keeps the brand green. Decorative — the button itself
 * carries the aria-label.
 */
const QUIKFILL_GLYPH_SVG = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M25.25 11.5 12.75 26.5H24l-1.25 10 12.5-15H24l1.25-9.5Z" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="35.4" cy="12.6" r="3.4" fill="#13C296"/>
</svg>`
