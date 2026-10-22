import { buildAiFillRequest, isFillableField, valuesToFillInstructions } from '@quikfill/ai'
import {
  onLocalFillPreferencesChange,
  readLocalFillPreferences,
  onExtensionSettingsChange,
  readExtensionSettings,
  requestAiFill,
  type AiClassifyReason,
} from '@quikfill/browser-adapter'
import { buildLocalFillPlan, localFillSkipReason } from '@quikfill/autofill-core'
import {
  applyFill,
  applyUndo,
  captureFillTargets,
  isOccludingHit,
  probeFields,
  qualifiesForFill,
  scanFormsGrouped,
  type FillTarget,
} from '@quikfill/form-scanner'
import {
  DEFAULT_EXTENSION_SETTINGS,
  DEFAULT_LOCAL_FILL_PREFERENCES,
  type DetectedField,
  type DetectedForm,
  type FillResult,
  type LocalFillPreferences,
  type ExtensionSettings,
  type UndoSnapshot,
} from '@quikfill/schemas'
import { buttonDiameter, shouldShowOverlay } from '../../lib/overlay-gate'
import { summarizeFill } from '../../lib/fill-summary'

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
  auth: {
    label: 'Sign in for AI',
    title: 'Open the QuikFill popup and sign in to use optional AI assist.',
  },
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
const FILL_TIMEOUT_MS = 30_000

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

type ButtonStatus = 'idle' | 'loading' | 'success' | 'partial' | 'error'

interface FormButton {
  groupRoot: Element
  formId: string
  /** The element the button is positioned against — the form's group root, so the
   *  action floats at the form's bottom-right edge (not on the submit control). */
  anchorEl: Element | null
  el: HTMLButtonElement
  label: HTMLSpanElement
  status: ButtonStatus
  panel: HTMLElement
  summary: HTMLElement
  details: HTMLUListElement
  undo: HTMLButtonElement
  dismiss: HTMLButtonElement
  ai: HTMLButtonElement
  statusTimer?: number
}

/**
 * Mount the in-page fill overlay: auto-detect each form, inject an isolated
 * Shadow-DOM floating button near its submit control, and on click collect
 * a local sample plan → applyFill. Optional AI assist sends redacted metadata. Re-detects via a debounced
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
  let ready = false
  let disposed = false
  let activeController: AbortController | null = null
  let activeRoot: Element | null = null
  let activeUrl = ''
  let lastUndo: {
    button: FormButton
    snapshot: UndoSnapshot
    targets: Map<string, FillTarget>
  } | null = null

  let preferences: LocalFillPreferences = DEFAULT_LOCAL_FILL_PREFERENCES

  // Dashboard-managed settings, synced into chrome.storage.local by the background
  // worker. Defaults until the first read resolves; the overlay reads them to gate
  // visibility (enable / blocklist / show-button) and size + position the button.
  let settings: ExtensionSettings = DEFAULT_EXTENSION_SETTINGS
  const applySettings = (s: ExtensionSettings): void => {
    settings = s
    // Custom property inherits through the shadow boundary onto `.qf-fill-btn`.
    host.style.setProperty('--qf-d', `${buttonDiameter(s.buttonSize)}px`)
  }
  const pageHostname = (): string => doc.defaultView?.location?.hostname ?? ''

  function removeAllButtons(): void {
    for (const [root, button] of buttons) {
      button.el.remove()
      button.panel.remove()
      anchorResize?.unobserve(button.panel)
      if (button.statusTimer) win.clearTimeout(button.statusTimer)
      if (button.anchorEl) anchorResize?.unobserve(button.anchorEl)
      buttons.delete(root)
    }
  }

  function scan(): void {
    // A debounce armed BEFORE a fill started can fire mid-probe — re-stamping the
    // data-qf-id markers the in-flight fill resolves by. Skip; the fill schedules
    // a fresh scan when it completes.
    if (busy || disposed || !ready) return
    // Local filling depends only on activation preferences, never on AI budget.
    if (!shouldShowOverlay(settings, pageHostname())) {
      // A quota or setting change must not remove access to the last undo.
      for (const button of buttons.values()) button.el.hidden = true
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
      // button-only forms (0) and single-input search boxes (1). The floor is 2, so a
      // multi-step / accordion form whose first open step shows just two inputs still
      // earns a button (email+password logins qualify too — accepted tradeoff).
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
        existing.el.hidden = false
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
        button.panel.remove()
        anchorResize?.unobserve(button.panel)
        if (button.statusTimer) win.clearTimeout(button.statusTimer)
        if (lastUndo?.button === button) lastUndo = null
        if (button.anchorEl) anchorResize?.unobserve(button.anchorEl)
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
    el.setAttribute('aria-label', 'Fill this form with local sample data')
    el.title = 'Generate local test data · only empty fields by default'
    const mark = ownerDoc.createElement('span')
    mark.className = 'qf-mark'
    // Inline the brand glyph (decorative — the button itself carries the aria-label).
    // The button's own gradient surface is the tile, so the glyph sits straight on it.
    mark.innerHTML = QUIKFILL_GLYPH_SVG
    const label = ownerDoc.createElement('span')
    label.className = 'qf-label'
    label.textContent = 'QuikFill'
    el.append(mark, label)
    const panel = ownerDoc.createElement('section')
    panel.className = 'qf-result'
    panel.setAttribute('aria-label', 'QuikFill result')
    panel.hidden = true
    const summary = ownerDoc.createElement('p')
    summary.setAttribute('role', 'status')
    summary.setAttribute('aria-live', 'polite')
    summary.setAttribute('aria-atomic', 'true')
    const disclosure = ownerDoc.createElement('details')
    const heading = ownerDoc.createElement('summary')
    heading.textContent = 'Field details'
    const details = ownerDoc.createElement('ul')
    disclosure.append(heading, details)
    const undo = ownerDoc.createElement('button')
    undo.type = 'button'
    undo.className = 'qf-undo'
    undo.textContent = 'Undo fill'
    undo.hidden = true
    const dismiss = ownerDoc.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'qf-undo'
    dismiss.textContent = 'Dismiss result'
    const ai = ownerDoc.createElement('button')
    ai.type = 'button'
    ai.className = 'qf-undo qf-ai'
    ai.textContent = 'AI assist'
    ai.title =
      'Optional: sends empty field labels and page context to QuikFill AI. Requires an account.'
    const note = ownerDoc.createElement('p')
    note.className = 'qf-note'
    note.textContent =
      'Fill uses local test data. AI assist sends field metadata and requires sign-in.'
    panel.append(summary, disclosure, undo, dismiss, ai, note)
    const button: FormButton = {
      groupRoot,
      formId,
      anchorEl,
      el,
      label,
      status: 'idle',
      panel,
      summary,
      details,
      undo,
      dismiss,
      ai,
    }
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void onFill(button)
    })
    shadowRoot.appendChild(el)
    shadowRoot.appendChild(panel)
    ai.addEventListener('click', () => {
      void onFill(button, 'ai')
    })
    undo.addEventListener('click', () => {
      void onUndo(button)
    })
    dismiss.addEventListener('click', () => {
      button.panel.hidden = true
    })
    // Track this form's box so the button follows its edge the instant the form
    // grows/shrinks (see the ResizeObserver note below). Unobserved on removal.
    anchorResize?.observe(anchorEl)
    anchorResize?.observe(panel)
    return button
  }

  async function onFill(button: FormButton, mode: 'local' | 'ai' = 'local'): Promise<void> {
    if (
      busy ||
      disposed ||
      !button.groupRoot.isConnected ||
      !shouldShowOverlay(settings, pageHostname())
    )
      return
    // The probe (and the fill itself) churns the DOM — dropdowns open, option
    // lists mount/unmount — and every mutation/focus would otherwise schedule a
    // re-scan that re-stamps data-qf-id markers MID-FLIGHT, breaking the very
    // ids the probe/fill resolve by. Hold re-scans until this fill completes.
    busy = true
    activeController = new AbortController()
    const controller = activeController
    const timeout = win.setTimeout(
      () => controller.abort('Fill timed out. Try again.'),
      FILL_TIMEOUT_MS,
    )
    const startUrl = doc.URL
    activeRoot = button.groupRoot
    activeUrl = startUrl
    setLocked(true)
    setStatus(button, 'loading')
    button.panel.hidden = true
    button.summary.textContent = ''
    button.details.replaceChildren()
    try {
      await runFill(button, controller.signal, startUrl, mode)
    } catch (error) {
      if (!disposed) {
        setStatus(button, 'error', {
          label: 'Fill stopped',
          title: controller.signal.aborted
            ? String(controller.signal.reason)
            : error instanceof Error
              ? error.message
              : 'Fill failed.',
        })
        button.panel.hidden = false
        button.summary.textContent = button.el.title
      }
    } finally {
      win.clearTimeout(timeout)
      activeController = null
      activeRoot = null
      busy = false
      setLocked(false)
      scheduleScan()
    }
  }

  function setLocked(locked: boolean): void {
    for (const button of buttons.values()) {
      button.el.disabled = locked
      button.el.setAttribute('aria-busy', String(locked && button.status === 'loading'))
      button.undo.disabled = locked
      button.ai.disabled = locked
    }
  }

  async function onUndo(button: FormButton): Promise<void> {
    const undo = lastUndo
    if (busy || disposed || !undo || undo.button !== button) return
    busy = true
    setLocked(true)
    try {
      const results = await applyUndo(undo.snapshot, button.groupRoot, { targets: undo.targets })
      const restored = results.filter((r) => r.status === 'success').length
      button.summary.textContent = `${restored}/${results.length} restored`
      button.details.replaceChildren(
        ...results.map((result) => {
          const item = doc.createElement('li')
          item.textContent = result.reason ?? 'Previous value restored.'
          return item
        }),
      )
      button.panel.hidden = false
      lastUndo = null
      button.undo.hidden = true
      setStatus(button, 'idle')
    } catch {
      button.summary.textContent = 'Undo failed. Your remaining fields were left unchanged.'
    } finally {
      busy = false
      setLocked(false)
      scheduleScan()
    }
  }

  async function runFill(
    button: FormButton,
    signal: AbortSignal,
    startUrl: string,
    mode: 'local' | 'ai',
  ): Promise<void> {
    // Re-scan for fresh fields (the DOM may have changed since injection).
    let result: ReturnType<typeof scanFormsGrouped>
    try {
      result = scanFormsGrouped(doc)
    } catch {
      setStatus(button, 'error')
      return
    }
    const fieldById = new Map<string, DetectedField>(result.fields.map((f) => [f.id, f]))
    const form = result.forms.find((f) => resolveGroupRoot(f, fieldById, doc) === button.groupRoot)
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
    const options = {
      onlyEmpty: preferences.onlyEmpty,
      seed: preferences.seed || undefined,
      locale: preferences.locale ?? settings.locale,
    }
    const skipped: FillResult[] = []
    const eligible = fields.filter((field) => {
      const reason = localFillSkipReason(field, options)
      if (reason) skipped.push({ detectedFieldId: field.id, status: 'skipped', reason })
      return !reason
    })
    const targets = captureFillTargets(eligible, button.groupRoot)
    const isCurrent = (): boolean =>
      !disposed &&
      !signal.aborted &&
      button.groupRoot.isConnected &&
      doc.URL === startUrl &&
      shouldShowOverlay(settings, pageHostname())
    const ensureCurrent = (): void => {
      if (!isCurrent()) throw new Error('The form or page changed. Scan the current form again.')
    }
    ensureCurrent()
    await probeFields(eligible, button.groupRoot, { signal, isCurrent })
    ensureCurrent()

    if (mode === 'local') {
      const batch = buildLocalFillPlan(eligible, options)
      await applyInstructions(button, batch.instructions, fields, targets, signal, isCurrent, [
        ...skipped,
        ...batch.skipped,
      ])
      return
    }

    // AI is a separate user action. Preserve existing/sensitive fields here too;
    // custom option lists still use the same local planner and exact executor.
    const custom = buildLocalFillPlan(
      eligible.filter(
        (f) => f.customWidget?.kind === 'select' || f.customWidget?.kind === 'multiselect',
      ),
      options,
    )
    const localPicks = custom.instructions
    skipped.push(...custom.skipped)
    const request = buildAiFillRequest(pageGlobals(doc), eligible, {
      locale: options.locale,
      dateFormat: settings.dateFormat,
    })
    if (!request) {
      await applyInstructions(button, localPicks, fields, targets, signal, isCurrent, skipped)
      return
    }
    const reply = await waitForReply(requestAiFill(request), signal)
    ensureCurrent()
    if (!reply.ok) {
      // The AI round-trip failed (quota / rate-limit / offline / a dead extension
      // context after an update). Custom-select picks are LOCAL and need no AI, so
      // still apply them — a failed AI call must not also abandon the dropdowns it
      // never owned. applyFill is pure DOM and works even when messaging is dead; a
      // truly dead context can still make DOM writes throw, so guard it. The button
      // then reports the AI failure below.
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
      await applyInstructions(button, localPicks, fields, targets, signal, isCurrent, skipped)
      setStatus(button, 'error', copy)
      button.summary.textContent = `${button.summary.textContent} · ${copy.title ?? copy.label}`
      return
    }

    const instructions = [
      ...valuesToFillInstructions(reply.response.values, eligible),
      ...localPicks,
    ]
    await applyInstructions(button, instructions, fields, targets, signal, isCurrent, skipped)
  }

  /** Apply a merged instruction batch and reflect the outcome on the button. */
  async function applyInstructions(
    button: FormButton,
    instructions: Parameters<typeof applyFill>[0],
    fields: DetectedField[],
    targets: Map<string, FillTarget>,
    signal: AbortSignal,
    isCurrent: () => boolean,
    skipped: FillResult[] = [],
  ): Promise<void> {
    const outcome = await applyFill(instructions, button.groupRoot, { targets, signal, isCurrent })
    if (disposed) return
    const summary = summarizeFill(fields, [...skipped, ...outcome.results])
    button.panel.hidden = false
    button.summary.textContent = summary.description
    button.details.replaceChildren(
      ...summary.results.map((result) => {
        const item = doc.createElement('li')
        const field = fields.find((field) => field.id === result.detectedFieldId)
        item.textContent = `${field?.labelText ?? field?.ariaLabel ?? field?.name ?? 'Field'}: ${result.status}${result.reason ? ` — ${result.reason}` : ''}`
        return item
      }),
    )
    if (outcome.undoSnapshot.entries.length) {
      if (lastUndo) lastUndo.button.undo.hidden = true
      lastUndo = { button, snapshot: outcome.undoSnapshot, targets }
      button.undo.hidden = false
    }
    setStatus(button, summary.complete ? 'success' : 'partial')
    button.label.textContent = summary.label
    reposition()
  }

  function setStatus(
    button: FormButton,
    status: ButtonStatus,
    error?: { label: string; title?: string },
  ): void {
    button.status = status
    if (button.statusTimer) win.clearTimeout(button.statusTimer)
    button.el.classList.remove('is-loading', 'is-success', 'is-partial', 'is-error')
    button.el.setAttribute('aria-busy', String(status === 'loading'))
    if (status !== 'error') button.el.removeAttribute('title')
    if (status === 'loading') {
      button.el.classList.add('is-loading')
      button.label.textContent = 'Filling…'
    } else if (status === 'success') {
      button.el.classList.add('is-success')
      button.label.textContent = 'Filled'
    } else if (status === 'partial') {
      button.el.classList.add('is-partial')
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
      button.statusTimer = win.setTimeout(
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
        button.panel.style.display = 'none'
        continue
      }
      const rect = anchor.getBoundingClientRect()
      // Hidden / zero-box anchor (e.g. inside a closed tab) → hide the button.
      if (rect.width === 0 && rect.height === 0) {
        button.el.style.display = 'none'
        button.panel.style.display = 'none'
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
        button.panel.style.display = 'none'
        continue
      }
      button.el.style.display = ''
      button.panel.style.display = ''
      // Pin the button just inside the form's chosen corner. `position: fixed`
      // uses viewport coordinates, so re-anchoring on scroll/resize keeps it glued
      // whether the form lives in normal flow or a fixed modal. Clamp so it stays
      // on-screen when the form runs past the viewport edge. The default
      // bottom-right anchors by `right`/`bottom`, so the resting circle never
      // moves and the label unfurls leftwards on hover.
      const INSET = 12
      const pos = settings.buttonPosition
      button.el.style.left = pos.endsWith('left') ? `${Math.max(8, rect.left + INSET)}px` : 'auto'
      button.el.style.right = pos.endsWith('right')
        ? `${Math.max(8, vw - rect.right + INSET)}px`
        : 'auto'
      button.el.style.top = pos.startsWith('top') ? `${Math.max(8, rect.top + INSET)}px` : 'auto'
      button.el.style.bottom = pos.startsWith('bottom')
        ? `${Math.max(8, vh - rect.bottom + INSET)}px`
        : 'auto'
      button.panel.style.left = button.el.style.left
      button.panel.style.right = button.el.style.right
      const buttonRect = button.el.getBoundingClientRect()
      const panelHeight = button.panel.getBoundingClientRect().height
      const above = buttonRect.top - panelHeight - 8
      const below = buttonRect.bottom + 8
      let panelTop = pos.startsWith('top') ? below : above
      if (panelTop < 8 && below + panelHeight <= vh - 8) panelTop = below
      if (panelTop + panelHeight > vh - 8 && above >= 8) panelTop = above
      button.panel.style.top = `${Math.max(8, Math.min(panelTop, vh - panelHeight - 8))}px`
      button.panel.style.bottom = 'auto'
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
    if (busy) {
      if (activeRoot && (!activeRoot.isConnected || doc.URL !== activeUrl)) {
        activeController?.abort('The form or page changed. Scan the current form again.')
      }
      return
    }
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

  // Reposition on scroll/resize, COALESCED to one layout pass per frame. A scroll
  // fires many events per frame and reposition() reads layout (getBoundingClientRect
  // + elementFromPoint) per button, so running it raw would force repeated synchronous
  // layout and could jank a heavy page. requestAnimationFrame collapses a burst into a
  // single read aligned with the browser's own paint. Both listeners stay `passive`
  // so they never block scrolling.
  let repositionRaf: number | undefined
  const scheduleReposition = (): void => {
    if (repositionRaf !== undefined) return
    repositionRaf = win.requestAnimationFrame(() => {
      repositionRaf = undefined
      reposition()
    })
  }
  win.addEventListener('scroll', scheduleReposition, { passive: true, capture: true })
  win.addEventListener('resize', scheduleReposition, { passive: true })

  // A form changing height — a toggle/accordion expanding, a conditional section or
  // validation message appearing — moves the edge the button is pinned to, but fires
  // neither a window `resize` (that's only the window, not an element) nor, for a
  // CSS-only show/hide of pre-rendered nodes, a childList mutation. So neither the
  // scroll/resize path nor the debounced scan would reposition it, and the button
  // strands at the old edge until some unrelated event nudges it. Observe each
  // anchor's box directly and feed the SAME rAF-coalesced reposition, so the button
  // tracks the form's corner in lockstep with the resize. Guarded: jsdom and older
  // runtimes may not implement ResizeObserver.
  const anchorResize: ResizeObserver | null =
    typeof win.ResizeObserver === 'function'
      ? new win.ResizeObserver(() => scheduleReposition())
      : null

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
      const ai = [...buttons.values()].find((b) => path.includes(b.ai))
      if (ai) void onFill(ai, 'ai')
      const undo = [...buttons.values()].find((b) => path.includes(b.undo))
      if (undo) void onUndo(undo)
      const dismiss = [...buttons.values()].find((b) => path.includes(b.dismiss))
      if (dismiss) dismiss.panel.hidden = true
      // Native disclosure activation still runs; capture only shields the host
      // page's outside-dismiss handlers, not the browser's default action.
    }
  }
  const SWALLOWED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const
  for (const type of SWALLOWED) win.addEventListener(type, swallowFromHost, true)

  // Hydrate local preferences before exposing a fill action. Storage failure
  // falls back to offline defaults; account/network hydration is never awaited.
  void Promise.all([
    readExtensionSettings().catch(() => DEFAULT_EXTENSION_SETTINGS),
    readLocalFillPreferences().catch(() => DEFAULT_LOCAL_FILL_PREFERENCES),
  ]).then(([s, prefs]) => {
    if (disposed) return
    applySettings(s)
    preferences = prefs
    ready = true
    scan()
  })
  const unsubscribePreferences = onLocalFillPreferencesChange((prefs) => {
    activeController?.abort('Fill preferences changed. Try again.')
    preferences = prefs
  })
  const unsubscribeSettings = onExtensionSettingsChange((s) => {
    applySettings(s)
    scan()
  })

  const cancel = (): void =>
    activeController?.abort('The page changed. Scan the current form again.')
  win.addEventListener('pagehide', cancel)
  win.addEventListener('popstate', cancel)

  return {
    rescan: scan,
    destroy() {
      disposed = true
      activeController?.abort('QuikFill was closed.')
      win.removeEventListener('pagehide', cancel)
      win.removeEventListener('popstate', cancel)
      observer.disconnect()
      if (debounce) win.clearTimeout(debounce)
      doc.removeEventListener('focusin', onFocusIn, true)
      for (const type of SWALLOWED) win.removeEventListener(type, swallowFromHost, true)
      if (repositionRaf !== undefined) win.cancelAnimationFrame(repositionRaf)
      anchorResize?.disconnect()
      win.removeEventListener('scroll', scheduleReposition, {
        capture: true,
      } as EventListenerOptions)
      win.removeEventListener('resize', scheduleReposition)
      for (const unsubscribe of [unsubscribePreferences, unsubscribeSettings]) {
        try {
          unsubscribe()
        } catch {
          /* the extension context may already be invalid */
        }
      }
      host.remove()
      removeAllButtons()
      lastUndo = null
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

function waitForReply<T>(reply: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(new Error(String(signal.reason ?? 'Fill cancelled.')))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    reply.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

const OVERLAY_CSS = `
:host { all: initial; }
[hidden] { display: none !important; }
.qf-result {
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  width: min(320px, calc(100vw - 16px));
  max-height: min(320px, 40vh);
  overflow: auto;
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  color: #172033;
  font: 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
  box-shadow: 0 4px 14px #0002;
}
.qf-result .qf-note { font-size: 12px; color: #475569; margin-top: 10px; }
.qf-result p { margin: 0 0 8px; }
.qf-result ul { margin: 8px 0; padding-left: 20px; overflow-wrap: anywhere; }
.qf-result summary { cursor: pointer; min-height: 44px; }
.qf-undo { min-height: 44px; padding: 8px 12px; margin: 8px 8px 0 0; border: 1px solid #94a3b8; border-radius: 8px; background: #fff; color: #172033; cursor: pointer; font: inherit; }
.qf-fill-btn:focus-visible, .qf-undo:focus-visible, .qf-result summary:focus-visible { outline: 3px solid #3f66e0; outline-offset: 3px; }
.qf-fill-btn:disabled, .qf-undo:disabled { cursor: wait; }
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
  /* Diameter is driven by the user's buttonSize setting via the --qf-d custom
     property (set on the host element, inherited across the shadow boundary);
     defaults to 46px. */
  height: var(--qf-d, 46px);
  min-width: var(--qf-d, 46px);
  /* (d - 24px glyph) / 2 on each side → the glyph sits dead-centre in the resting
     circle. padding-right stays fixed so the glyph keeps its place when the pill opens. */
  padding: 0 calc((var(--qf-d, 46px) - 24px) / 2);
  border: none;
  border-radius: calc(var(--qf-d, 46px) / 2); /* = d/2: a circle when resting, a pill once the label opens */
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
.qf-fill-btn.is-partial,
.qf-fill-btn.is-error {
  padding-left: calc((var(--qf-d, 46px) - 24px) / 2 + 7px);
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
.qf-fill-btn.is-partial .qf-label,
.qf-fill-btn.is-error .qf-label {
  max-width: 150px;
  margin-right: 8px;
  opacity: 1;
}
.qf-fill-btn.is-success { background: #13c296; box-shadow: 0 8px 22px rgba(19, 194, 150, 0.45); }
.qf-fill-btn.is-error { background: #e11d48; box-shadow: 0 8px 22px rgba(225, 29, 72, 0.45); }
.qf-fill-btn.is-partial { background: #855000; }
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
