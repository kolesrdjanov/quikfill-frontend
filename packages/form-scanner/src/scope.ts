import type { ScanScope, ScanScopeKind } from '@quikfill/schemas'
import { isCustomSelectTrigger, isFormControl, isVisible } from './extract'

/** The container a scan resolved to: the element to walk plus how to describe it. */
export interface ResolvedScope {
  root: Document | Element
  kind: ScanScopeKind
  label: string
}

const DIALOG_SELECTOR = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]'
// Headless/drawer libraries that don't always set aria-modal/role=dialog.
const DRAWER_SELECTOR =
  '[data-radix-dialog-content], [data-headlessui-state~="open"], [data-drawer][aria-hidden="false"], .drawer.open, [data-state="open"][role]'

// A class token that names a drawer/sheet/off-canvas surface. Matched as a whole
// kebab/snake token, so `drawer`, `drawer-body`, `app_sidebar`, `slide-over` all
// qualify but `slider`/`canvas`/`subdrawer` do not. Many real drawers ship NO
// aria-modal/role/data-state — only these classes — and leave the top nav (with a
// focused search) visible outside the overlay, which is exactly the case that used
// to mis-scope to that outside search's form.
const DRAWER_CLASS_RE = /(?:^|[\s_-])(?:drawer|sheet|sidebar|off-?canvas|slide-?over)(?:[\s_-]|$)/i

/**
 * Pick the best container to scan. Priority for 'auto': an open dialog/drawer →
 * the focused-or-largest form → the whole document. Explicit scopes fall back to
 * the page when their target is absent. Runs in the content script (live DOM).
 */
export function resolveScopeRoot(doc: Document, scope: ScanScope): ResolvedScope {
  if (scope === 'page') return pageScope(doc)
  if (scope === 'dialog') return findDialog(doc) ?? pageScope(doc)
  if (scope === 'form') return findForm(doc) ?? pageScope(doc)
  return findDialog(doc) ?? findForm(doc) ?? pageScope(doc)
}

function pageScope(doc: Document): ResolvedScope {
  return { root: doc, kind: 'page', label: 'Whole page' }
}

function findDialog(doc: Document): ResolvedScope | null {
  const all = unique([
    ...Array.from(doc.querySelectorAll(DIALOG_SELECTOR)),
    ...Array.from(doc.querySelectorAll(DRAWER_SELECTOR)),
    ...classDrawers(doc),
  ])
  const open = all.filter((el) => isVisible(el) && hasFillable(el))
  if (open.length === 0) return null
  const best = pickTopmost(open)
  const kind: ScanScopeKind = isDrawerLike(best) ? 'drawer' : 'dialog'
  return { root: best, kind, label: containerLabel(best, kind) }
}

function findForm(doc: Document): ResolvedScope | null {
  // 1) The form wrapping the focused element — the strongest signal of intent.
  //    But NOT a search/navigation form: a focused top-nav search is page chrome,
  //    not the form to fill, and letting it win scope sent fills outside the drawer.
  const active = doc.activeElement
  if (active && active !== doc.body) {
    const f = active.closest('form')
    if (f && !isChromeForm(f) && isVisible(f) && hasFillable(f))
      return { root: f, kind: 'form', label: containerLabel(f, 'form') }
  }
  // 2) Otherwise the visible form with the most fillable fields.
  const ranked = Array.from(doc.querySelectorAll('form'))
    .filter((f) => isVisible(f))
    .map((f) => ({ f, n: countFillable(f) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  const best = ranked[0]?.f
  if (!best) return null
  return { root: best, kind: 'form', label: containerLabel(best, 'form') }
}

// --- helpers ---------------------------------------------------------------

/**
 * Elements whose class names a drawer surface. A cheap substring prefilter narrows
 * the scan, then `DRAWER_CLASS_RE` confirms a whole-token match (so `slider` and a
 * lone `canvas` never qualify). The `hasFillable` + topmost filters in findDialog
 * then keep only the real, frontmost open panel.
 */
function classDrawers(doc: Document): Element[] {
  const prefilter =
    '[class*="drawer" i], [class*="sheet" i], [class*="sidebar" i], [class*="canvas" i], [class*="slide" i]'
  return Array.from(doc.querySelectorAll(prefilter)).filter(
    (el) =>
      DRAWER_CLASS_RE.test(el.getAttribute('class') ?? '') &&
      // A modal drawer is never page chrome. This keeps a persistent nav `.sidebar`
      // (which also matches the class regex) from hijacking scope as a "drawer".
      !el.closest('nav, header, [role="navigation"], [role="banner"]'),
  )
}

/** A search box or a form inside a nav/banner landmark — page chrome, not the target form. */
function isChromeForm(f: Element): boolean {
  if (f.getAttribute('role') === 'search') return true
  return !!f.closest('nav, header, [role="navigation"], [role="banner"], [role="search"]')
}

function hasFillable(el: Element): boolean {
  for (const cand of Array.from(el.querySelectorAll('*'))) {
    if (isFormControl(cand) && isVisible(cand)) return true
    if (isCustomSelectTrigger(cand)) return true
  }
  return false
}

function countFillable(el: Element): number {
  let n = 0
  for (const cand of Array.from(el.querySelectorAll('*'))) {
    if ((isFormControl(cand) && isVisible(cand)) || isCustomSelectTrigger(cand)) n++
  }
  return n
}

/** Innermost open layer, then highest z-index, then last in DOM. */
function pickTopmost(els: Element[]): Element {
  const leaves = els.filter((a) => !els.some((b) => b !== a && a.contains(b)))
  const pool = leaves.length ? leaves : els
  return pool
    .map((el, i) => ({ el, z: effectiveZIndex(el), i }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .at(-1)!.el
}

function effectiveZIndex(el: Element): number {
  let node: Element | null = el
  for (let i = 0; node && i < 10; i++) {
    const style = safeStyle(node)
    const z = style ? parseInt(style.zIndex, 10) : NaN
    if (!Number.isNaN(z)) return z
    node = node.parentElement
  }
  return 0
}

function safeStyle(el: Element): CSSStyleDeclaration | undefined {
  try {
    return el.ownerDocument?.defaultView?.getComputedStyle(el) ?? undefined
  } catch {
    return undefined
  }
}

function isDrawerLike(el: Element): boolean {
  const cls = el.getAttribute('class') ?? ''
  if (DRAWER_CLASS_RE.test(cls)) return true
  if (el.hasAttribute('data-drawer')) return true
  // Not a real modal dialog but an open panel → call it a drawer.
  return !el.matches(DIALOG_SELECTOR) && el.matches(DRAWER_SELECTOR)
}

/** Friendly name: aria-label → labelledby target → nearest heading → kind word. */
function containerLabel(el: Element, kind: ScanScopeKind): string {
  const aria = el.getAttribute('aria-label')?.trim()
  const base = aria || labelledByText(el) || headingText(el)
  if (kind === 'form') return base || 'This form'
  if (kind === 'page') return 'Whole page'
  return base ? `${base} ${kind}` : capitalize(kind)
}

function labelledByText(el: Element): string | undefined {
  const ids = el.getAttribute('aria-labelledby')?.trim()
  if (!ids) return undefined
  const root = el.getRootNode() as Document | ShadowRoot
  const text = ids
    .split(/\s+/)
    .map((id) => root.querySelector?.(`#${cssEscapeId(id)}`)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  return text || undefined
}

function headingText(el: Element): string | undefined {
  const heading = el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]')
  const text = heading?.textContent?.replace(/\s+/g, ' ').trim()
  return text || undefined
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function cssEscapeId(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  if (g.CSS?.escape) return g.CSS.escape(value)
  return value.replace(/["\\#.:>~+*^$|()=\s[\]]/g, '\\$&')
}

function unique(els: Element[]): Element[] {
  return Array.from(new Set(els))
}
