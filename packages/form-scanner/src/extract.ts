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

/** Resolve a control's label via <label for>, wrapping <label>, or aria-label(ledby). */
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
  return undefined
}

export function getAriaLabel(el: FormControl): string | undefined {
  return el.getAttribute('aria-label')?.trim() || undefined
}

export function getAriaLabelledByText(
  el: FormControl,
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
export function isVisible(el: FormControl): boolean {
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
export function getSelectorCandidates(el: FormControl): string[] {
  const candidates: string[] = []
  const id = el.getAttribute('id')
  if (id) candidates.push(`#${cssEscape(id)}`)

  const name = el.getAttribute('name')
  const tag = el.tagName.toLowerCase()
  if (name) candidates.push(`${tag}[name="${cssEscape(name)}"]`)

  const dataTestId = el.getAttribute('data-testid')
  if (dataTestId) candidates.push(`${tag}[data-testid="${cssEscape(dataTestId)}"]`)

  const ac = el.getAttribute('autocomplete')
  if (ac) candidates.push(`${tag}[autocomplete="${cssEscape(ac)}"]`)

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

/** Minimal CSS.escape fallback for environments without it. */
export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  if (g.CSS?.escape) return g.CSS.escape(value)
  return value.replace(/["\\#.:>~+*^$|()=\s[\]]/g, '\\$&')
}
