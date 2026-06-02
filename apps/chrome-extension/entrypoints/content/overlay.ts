import {
  buildAiFillRequest,
  isFillableField,
  localPickInstructions,
  valuesToFillInstructions,
} from '@quikfill/ai'
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
  probeFields,
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

/**
 * False once THIS content script's extension context has been invalidated — i.e.
 * the tab predates an extension update/reload, so every `chrome.runtime` message
 * throws. Used to tell a dead-context failure (reload the page) apart from a real
 * connectivity failure (offline).
 */
const isExtensionAlive = (): boolean => {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

type ButtonStatus = 'idle' | 'loading' | 'success' | 'error'

interface FormButton {
  groupRoot: Element
  formId: string
  /** The element the button is positioned against — the form's group root, so the
   *  action floats at the form's bottom-right edge (not on the submit control). */
  anchorEl: Element | null
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
  // A re-injected content script (background `onInstalled` heals orphaned tabs)
  // runs alongside the dead script's leftover DOM — drop any stale host first so
  // we never stack two overlays / two sets of buttons on the page.
  doc.getElementById(HOST_ID)?.remove()
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
    // A debounce armed BEFORE a fill started can fire mid-probe — re-stamping the
    // data-qf-id markers the in-flight fill resolves by. Skip; the fill schedules
    // a fresh scan when it completes.
    if (busy) return
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

      // Position the action against the FORM's bounding box (the group root) so it
      // floats at the form's bottom-right edge — independent of where (or whether)
      // a submit control sits.
      seen.add(groupRoot)
      const existing = buttons.get(groupRoot)
      if (existing) {
        existing.anchorEl = groupRoot
        existing.formId = form.formId
      } else {
        buttons.set(groupRoot, createButton(groupRoot, form.formId, groupRoot, shadow, doc))
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
    anchorEl: Element,
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
    label.textContent = 'QuikFill'
    el.append(mark, label)
    const button: FormButton = { groupRoot, formId, anchorEl, el, label, status: 'idle' }
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
    // The probe (and the fill itself) churns the DOM — dropdowns open, option
    // lists mount/unmount — and every mutation/focus would otherwise schedule a
    // re-scan that re-stamps data-qf-id markers MID-FLIGHT, breaking the very
    // ids the probe/fill resolve by. Hold re-scans until this fill completes.
    busy = true
    try {
      await runFill(button)
    } finally {
      busy = false
      scheduleScan()
    }
  }

  async function runFill(button: FormButton): Promise<void> {
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

    // Probe phase: briefly open each on-demand custom select to harvest its REAL
    // options (and each datepicker input to read its calendar's min/max), so
    // dropdowns are picked from values that exist and dates land inside the
    // picker's range. Enriches `fields` in place; never throws.
    await probeFields(fields, doc)

    // Custom selects are picked locally (random, from the probed options) — only
    // the remaining fields (text inputs, native selects, datepickers) need the AI.
    const localPicks = localPickInstructions(fields)
    const request = buildAiFillRequest(pageGlobals(doc), fields)
    if (!request) {
      // Nothing for the AI (a form of only dropdowns) — apply the local picks.
      await applyInstructions(button, localPicks)
      return
    }
    const reply = await requestAiFill(request)
    if (!reply.ok) {
      // A dead extension context (the tab predates an update/reload) makes every
      // message throw, which `requestAiFill` reports as `offline` — but that's not a
      // connectivity problem, so point the user at the real fix rather than a
      // misleading "Offline". Otherwise surface the mapped cause (quota / rate-limit
      // / auth / …) so a 429 QUOTA_EXCEEDED reads as "AI limit reached".
      const copy =
        reply.reason === 'offline' && !isExtensionAlive()
          ? {
              label: 'Reload page',
              title: 'QuikFill was updated — reload this page to keep filling.',
            }
          : ERROR_COPY[reply.reason]
      setStatus(button, 'error', copy)
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

    const instructions = [...valuesToFillInstructions(reply.response.values, fields), ...localPicks]
    await applyInstructions(button, instructions)
  }

  /** Apply a merged instruction batch and reflect the outcome on the button. */
  async function applyInstructions(
    button: FormButton,
    instructions: Parameters<typeof applyFill>[0],
  ): Promise<void> {
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
      button.label.textContent = 'QuikFill'
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
    const vw = win.innerWidth || doc.documentElement.clientWidth
    const vh = win.innerHeight || doc.documentElement.clientHeight
    for (const button of buttons.values()) {
      const anchor = button.anchorEl
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
      // Occlusion guard: hit-test the form's centre (clamped on-screen so a tall
      // form scrolled past its midpoint isn't mistaken for occluded). A drawer/
      // modal/sticky element covering the form returns a foreign element → hide the
      // button so it can't float on top of an overlay sitting above the form. Our
      // own host is ignored, so the button never hides itself. When the cover
      // closes, the resulting DOM mutation re-scans → reposition → it returns.
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1)
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1)
      if (isOccludingHit(anchor, host, doc.elementFromPoint(cx, cy))) {
        button.el.style.display = 'none'
        continue
      }
      button.el.style.display = ''
      // Pin the button's bottom-right corner just inside the form's bottom-right
      // edge, anchored by `right`/`bottom` (not left/top) so the resting circle
      // never moves and the label unfurls leftwards on hover. `position: fixed`
      // uses viewport coordinates, so re-anchoring on scroll/resize keeps it glued
      // whether the form lives in normal flow or a fixed modal. Clamp so it stays
      // on-screen when the form runs past the viewport edge.
      const INSET = 12
      button.el.style.right = `${Math.max(8, vw - rect.right + INSET)}px`
      button.el.style.bottom = `${Math.max(8, vh - rect.bottom + INSET)}px`
      button.el.style.left = 'auto'
      button.el.style.top = 'auto'
    }
  }

  const win = doc.defaultView ?? window

  // Debounced re-scan on DOM changes. childList+subtree only (NOT attributes) so
  // the scanner's own data-qf-id / data-qf-form stamping can't feed the loop.
  // While a fill is in flight (`busy`), re-scans are held entirely — the probe's
  // DOM churn must not re-stamp the data-qf-id markers the fill resolves by; the
  // fill schedules one final scan itself when it finishes.
  let busy = false
  let debounce: number | undefined
  const scheduleScan = (): void => {
    if (busy) return
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
  /* Glyph (DOM-first child) renders on the RIGHT — the pinned corner — and the
     label unfurls to its LEFT, so the resting circle never moves on hover. */
  flex-direction: row-reverse;
  align-items: center;
  justify-content: center;
  height: 46px;
  min-width: 46px;
  /* 11 + 24px glyph + 11 = 46 → the glyph sits dead-centre in the resting circle.
     padding-right stays fixed so the glyph keeps its place when the pill opens. */
  padding: 0 11px;
  border: none;
  border-radius: 23px; /* = height / 2: a circle at 46x46, a pill once the label opens */
  background: linear-gradient(135deg, #3f66e0, #2544c0);
  color: #ffffff;
  font: 600 14px/1 system-ui, -apple-system, Segoe UI, sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 68, 192, 0.36);
  overflow: hidden;
  white-space: nowrap;
  /* Animate ONLY interpolable properties — never width:auto, which snaps. The
     button is content-sized: it eases into a pill because the LABEL's max-width
     opens and the button reflows leftwards to follow it. Depth comes from the
     shadow, not a translate, so the button itself never moves. */
  transition:
    padding-left 0.2s ease,
    box-shadow 0.2s ease,
    background 0.15s ease;
  animation: qf-pulse 2.4s ease-in-out infinite;
}
/* Resting attention pulse — a soft halo that breathes out and fades. Pauses while
   hovered / busy so the open pill reads as steady. */
@keyframes qf-pulse {
  0%   { box-shadow: 0 4px 14px rgba(37, 68, 192, 0.36), 0 0 0 0 rgba(63, 102, 224, 0.5); }
  70%  { box-shadow: 0 4px 14px rgba(37, 68, 192, 0.36), 0 0 0 12px rgba(63, 102, 224, 0); }
  100% { box-shadow: 0 4px 14px rgba(37, 68, 192, 0.36), 0 0 0 0 rgba(63, 102, 224, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .qf-fill-btn { animation: none; }
}
.qf-fill-btn:hover,
.qf-fill-btn.is-loading,
.qf-fill-btn.is-success,
.qf-fill-btn.is-error {
  padding-left: 18px;
  box-shadow: 0 8px 22px rgba(37, 68, 192, 0.45);
  animation: none;
}
.qf-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}
.qf-mark svg { width: 24px; height: 24px; display: block; }
.qf-label {
  max-width: 0;
  margin-right: 0; /* gap toward the glyph on its right (row-reverse) — eases open with the label */
  opacity: 0;
  overflow: hidden;
  transition:
    max-width 0.2s ease,
    margin-right 0.2s ease,
    opacity 0.15s ease;
}
.qf-fill-btn:hover .qf-label,
.qf-fill-btn.is-loading .qf-label,
.qf-fill-btn.is-success .qf-label,
.qf-fill-btn.is-error .qf-label {
  max-width: 150px;
  margin-right: 8px;
  opacity: 1;
}
.qf-fill-btn.is-success { background: #13c296; box-shadow: 0 8px 22px rgba(19, 194, 150, 0.45); }
.qf-fill-btn.is-error { background: #e11d48; box-shadow: 0 8px 22px rgba(225, 29, 72, 0.45); }
.qf-fill-btn.is-loading { cursor: default; }
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
