import { beforeEach, describe, expect, it } from 'vitest'
import type { DetectedField, FillInstruction } from '@quikfill/schemas'
import { applyFill } from './fill'
import { scanForms } from './scan'

/**
 * CROSS-APP DROPDOWN CORPUS
 * =========================
 * The universality guard. Each case is a real (or faithfully reconstructed)
 * dropdown-in-a-drawer from a DIFFERENT app, plus a model of how that app's drawer
 * dismisses. We run the REAL pipeline against it — `scanForms` → build instruction
 * → `applyFill` — and assert two things on every trial:
 *
 *   1. The host drawer is STILL OPEN afterwards (the bug that bit us five times).
 *   2. The fill outcome is what we expect (selected / assisted / skipped).
 *
 * jsdom can't run each app's real JS, so a case MODELS the app's interactive
 * behaviour (open on trigger click, filter on type, close on select) and — crucially
 * — its drawer DISMISS contract (`dismissOn`), which you read straight off the
 * tracer: which signal collapses that drawer. A fill that emits any such signal will
 * flip `drawerStaysOpen` to false and fail the case. That's the regression value.
 *
 * ── HOW TO ADD A REAL APP ────────────────────────────────────────────────────────
 * 1. On the failing form, capture the drawer with the dropdown CLOSED and OPEN
 *    (the console snapshot trick). Reduce to the drawer subtree.
 * 2. Add a `DropdownCase`:
 *      - `closedHtml`     the drawer + closed widget (what `scanForms` sees).
 *      - `openPanelHtml`  the option list that appears on open (from the open capture).
 *      - `panelMount`     where that list renders: 'container' (inside the field) or
 *                         'body' (portaled out of the drawer).
 *      - `dismissOn`      which signals close THIS drawer — read from the tracer
 *                         (escape? outside pointerdown? focus leaving it?).
 *      - `searchInput`    selector of the typeahead input, if the widget filters.
 *      - `trials`         proposed value → expected status (+ acceptedValue).
 * 3. Run `pnpm vitest run src/dropdown-corpus.test.ts`. A new app that fails is a
 *    permanent regression test, not a surprise in the field.
 */

interface DismissModel {
  /** Drawer closes on a document-level Escape keydown (most modals/drawers do). */
  escape: boolean
  /** Drawer closes on a pointerdown that lands outside the currently-open layer. */
  outsidePointer: boolean
  /** Drawer closes when focus leaves it entirely. */
  focusOut: boolean
}

interface Trial {
  value: string
  status: 'success' | 'assisted' | 'skipped' | 'failed'
  /** Expected accepted value on success (the option label that was selected). */
  accepted?: string | null
}

interface DropdownCase {
  name: string
  /** The drawer subtree, dropdown CLOSED — what scanForms sees. */
  closedHtml: string
  /** The option list inserted when the trigger is clicked (from the OPEN capture). */
  openPanelHtml: string
  /** Where the option list mounts: inside the field container, or portaled to <body>. */
  panelMount: 'container' | 'body'
  /** Selector (within the closed widget) of the field container the list mounts into. */
  containerSelector: string
  /** How this app's drawer dismisses — read off the tracer. */
  dismissOn: DismissModel
  /** Typeahead/filter input selector, when the widget filters as you type. */
  searchInput?: string
  trials: Trial[]
}

// ── Case 1: self-storage facility drawer (the originally-failing app) ──────────────
// Bespoke Tailwind widget: trigger is a <div role="button" data-trigger="select">,
// text-only options (role="button" aria-label="Select option"), option panel rendered
// INSIDE the field container (not portaled). Drawer is a class-only `.drawer` with no
// role/aria-modal that closes on BOTH Escape and an outside pointerdown (confirmed
// live). A stray icon <button> sits in the drawer — the kind of node the old trigger
// selector used to drift onto and collapse the drawer.
const selfStorageFacility: DropdownCase = {
  name: 'self-storage facility drawer — text-only country select, panel in-container',
  closedHtml: `
    <div class="drawer" data-test-id="drawer">
      <button class="relative flex items-center justify-center [&_svg]:w-6" data-test-id="drawer-close">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12"/></svg>
      </button>
      <form>
        <div class="field" data-test-id="address-country" name="address.country">
          <label>Country</label>
          <div class="relative">
            <div role="button" data-trigger="select" aria-expanded="false">
              <div class="select-value-container">
                <p class="placeholder">i.e. United States</p>
                <input id="country-search" type="text" autocomplete="off" />
              </div>
              <svg class="chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
      </form>
    </div>`,
  openPanelHtml: `
    <div class="dropdown">
      <div role="button" aria-label="Select option">United States</div>
      <div role="button" aria-label="Select option">Canada</div>
      <div role="button" aria-label="Select option">Mexico</div>
      <div role="button" aria-label="Select option">United Kingdom</div>
      <div role="button" aria-label="Select option">Germany</div>
    </div>`,
  panelMount: 'container',
  containerSelector: '[data-test-id="address-country"] .relative',
  dismissOn: { escape: true, outsidePointer: true, focusOut: false },
  searchInput: '#country-search',
  trials: [
    { value: 'Canada', status: 'success', accepted: 'Canada' },
    { value: 'united kingdom', status: 'success', accepted: 'United Kingdom' }, // case-insensitive
    { value: 'USA', status: 'assisted' }, // no option text matches "USA" → left open, drawer survives
  ],
}

const CASES: DropdownCase[] = [selfStorageFacility]

// ── Harness ───────────────────────────────────────────────────────────────────────

interface WiredCase {
  /** The scan/fill scope root (the drawer element). */
  root: HTMLElement
  /** True while the host drawer is still open (not dismissed, still connected). */
  drawerOpen(): boolean
  /** Detach the document-level listeners this case installed. */
  teardown(): void
}

/**
 * Mount a case's CLOSED html and attach a faithful model of the app: the trigger
 * opens the option panel; typing filters it; clicking an option selects + closes the
 * panel; and the drawer dismisses per `dismissOn`. Returns a probe + teardown.
 */
function wire(c: DropdownCase): WiredCase {
  document.body.innerHTML = c.closedHtml
  const root = document.querySelector('.drawer') as HTMLElement
  const trigger = root.querySelector('[data-trigger="select"]') as HTMLElement
  const container = root.querySelector(c.containerSelector) as HTMLElement
  const search = c.searchInput
    ? (root.querySelector(c.searchInput) as HTMLInputElement | null)
    : null

  let drawerClosed = false
  let panel: HTMLElement | null = null

  const allOptionsHtml = c.openPanelHtml
  const openPanel = (): void => {
    if (panel) return
    const host = c.panelMount === 'body' ? document.body : container
    host.insertAdjacentHTML('beforeend', allOptionsHtml)
    panel = host.querySelector('.dropdown') as HTMLElement
    trigger.setAttribute('aria-expanded', 'true')
    // Selecting an option: update the display and close the panel (drawer-safe).
    for (const opt of Array.from(panel.querySelectorAll('[role="button"]'))) {
      opt.addEventListener('click', () => {
        const p = container.querySelector('.placeholder')
        if (p) p.textContent = opt.textContent
        if (search) search.value = opt.textContent ?? ''
        closePanel()
      })
    }
  }
  const closePanel = (): void => {
    panel?.remove()
    panel = null
    trigger.setAttribute('aria-expanded', 'false')
  }

  trigger.addEventListener('click', () => (panel ? undefined : openPanel()))

  // Typeahead: filter the open options by substring as the user types.
  if (search) {
    search.addEventListener('input', () => {
      if (!panel) return
      const q = search.value.trim().toLowerCase()
      for (const opt of Array.from(panel.querySelectorAll('[role="button"]'))) {
        const hit = (opt.textContent ?? '').toLowerCase().includes(q)
        ;(opt as HTMLElement).style.display = hit ? '' : 'none'
        // A filtered-out option is removed from the a11y tree the way real widgets do.
        if (hit) opt.removeAttribute('hidden')
        else opt.setAttribute('hidden', '')
      }
    })
  }

  // The drawer's dismiss contract — the part that varies per app.
  const onKeydown = (e: Event): void => {
    if (c.dismissOn.escape && (e as KeyboardEvent).key === 'Escape') drawerClosed = true
  }
  const onPointerdown = (e: Event): void => {
    if (!c.dismissOn.outsidePointer) return
    // A press outside the currently-open layer (the panel, if open; else the drawer)
    // dismisses the drawer.
    const layer = panel ?? root
    if (!layer.contains(e.target as Node)) drawerClosed = true
  }
  const onFocusout = (e: Event): void => {
    if (!c.dismissOn.focusOut) return
    const next = (e as FocusEvent).relatedTarget as Node | null
    if (next && !root.contains(next)) drawerClosed = true
  }
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('pointerdown', onPointerdown, true)
  document.addEventListener('focusout', onFocusout, true)

  return {
    root,
    drawerOpen: () => !drawerClosed && root.isConnected,
    teardown: () => {
      document.removeEventListener('keydown', onKeydown, true)
      document.removeEventListener('pointerdown', onPointerdown, true)
      document.removeEventListener('focusout', onFocusout, true)
    },
  }
}

/** Build the fill instruction the production pipeline would hand `applyFill`. */
function toInstruction(field: DetectedField, value: string): FillInstruction {
  return {
    detectedFieldId: field.id,
    selectorCandidates: field.selectorCandidates,
    frame: field.frame,
    shadow: field.shadow,
    tagName: field.tagName,
    inputType: field.inputType,
    fillStrategy: 'customSelect',
    proposedValue: value,
    customWidget: field.customWidget,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('dropdown corpus — fill never collapses a host drawer (cross-app)', () => {
  for (const c of CASES) {
    for (const trial of c.trials) {
      it(`${c.name} → "${trial.value}" ⇒ ${trial.status}, drawer stays open`, async () => {
        const w = wire(c)
        try {
          const { fields } = scanForms(w.root, { scope: 'page', includeHidden: false })
          const field = fields.find((f) => f.inputType === 'customSelect')
          expect(field, 'scanForms should detect the custom select').toBeDefined()

          const { results } = await applyFill([toInstruction(field!, trial.value)], w.root)

          // The invariant that matters across every app: the drawer survives.
          expect(w.drawerOpen(), 'host drawer must remain open after the fill').toBe(true)
          expect(results[0].status).toBe(trial.status)
          if (trial.accepted !== undefined) {
            expect(results[0].acceptedValue).toBe(trial.accepted)
          }
        } finally {
          w.teardown()
        }
      })
    }
  }
})
