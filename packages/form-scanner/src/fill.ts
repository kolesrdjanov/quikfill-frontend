import type { FillInstruction, FillResult, UndoEntry, UndoSnapshot } from '@quikfill/schemas'

export interface FillOutcome {
  results: FillResult[]
  undoSnapshot: UndoSnapshot
}

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement

const TRUTHY = new Set(['true', 'on', 'yes', '1', 'checked'])

/**
 * Apply a batch of fill instructions to the page. Captures an undo snapshot
 * first, writes via native setters + event dispatch, verifies each value, and
 * returns structured per-field results. Never throws on a single bad field.
 */
export function applyFill(instructions: FillInstruction[], root: Document = document): FillOutcome {
  const results: FillResult[] = []
  const entries: UndoEntry[] = []

  for (const ins of instructions) {
    const el = findElement(root, ins.selectorCandidates)
    if (!el) {
      results.push(skip(ins.detectedFieldId, 'Element not found on the page.'))
      continue
    }
    if (isDisabled(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is disabled.'))
      continue
    }
    if (isReadonly(el)) {
      results.push(skip(ins.detectedFieldId, 'Field is read-only.'))
      continue
    }

    entries.push(capture(ins, el))

    try {
      const result = writeAndVerify(ins, el)
      results.push(result)
    } catch (e) {
      results.push(fail(ins.detectedFieldId, e instanceof Error ? e.message : 'Fill failed.'))
    }
  }

  return { results, undoSnapshot: { entries, capturedAt: new Date().toISOString() } }
}

/** Restore the values captured in a snapshot (undo the most recent fill). */
export function applyUndo(snapshot: UndoSnapshot, root: Document = document): FillResult[] {
  const results: FillResult[] = []
  for (const entry of snapshot.entries) {
    const el = findElement(root, entry.selectorCandidates)
    if (!el) {
      results.push(skip(entry.detectedFieldId, 'Element not found on the page.'))
      continue
    }
    try {
      if (isToggle(el) && entry.previousChecked !== undefined) {
        setChecked(el as HTMLInputElement, entry.previousChecked)
      } else {
        setValue(el, entry.previousValue ?? '')
      }
      results.push(success(entry.detectedFieldId, entry.previousValue))
    } catch (e) {
      results.push(fail(entry.detectedFieldId, e instanceof Error ? e.message : 'Undo failed.'))
    }
  }
  return results
}

function writeAndVerify(ins: FillInstruction, el: Fillable): FillResult {
  if (isToggle(el)) {
    const desired = TRUTHY.has(ins.proposedValue.toLowerCase().trim())
    setChecked(el as HTMLInputElement, desired)
    return (el as HTMLInputElement).checked === desired
      ? success(ins.detectedFieldId, String(desired))
      : fail(ins.detectedFieldId, 'Checkbox/radio did not accept the toggle.')
  }

  setValue(el, ins.proposedValue)
  const accepted = readValue(el)
  if (accepted !== ins.proposedValue) {
    return fail(
      ins.detectedFieldId,
      `Value not accepted (wanted "${ins.proposedValue}", got "${accepted}").`,
    )
  }
  return success(ins.detectedFieldId, accepted)
}

function capture(ins: FillInstruction, el: Fillable): UndoEntry {
  return {
    detectedFieldId: ins.detectedFieldId,
    selectorCandidates: ins.selectorCandidates,
    frame: ins.frame,
    shadow: ins.shadow,
    previousValue: readValue(el),
    previousChecked: isToggle(el) ? (el as HTMLInputElement).checked : undefined,
  }
}

// --- DOM primitives -------------------------------------------------------

function isToggle(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'input') return false
  const t = (el as HTMLInputElement).type.toLowerCase()
  return t === 'checkbox' || t === 'radio'
}

function isDisabled(el: Fillable): boolean {
  return el.hasAttribute('disabled') || (el as HTMLInputElement).disabled === true
}
function isReadonly(el: Fillable): boolean {
  return el.hasAttribute('readonly') || (el as HTMLInputElement).readOnly === true
}

function readValue(el: Fillable): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return (el as HTMLInputElement).value ?? ''
  }
  return el.textContent ?? ''
}

/**
 * Set a value using the prototype's native setter so framework-controlled
 * (React/Vue) inputs notice the change, then dispatch input/change/blur.
 */
function setValue(el: Fillable, value: string): void {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    setNativeValue(el, value)
  } else {
    el.textContent = value
  }
  dispatch(el, 'input')
  dispatch(el, 'change')
  dispatch(el, 'blur')
}

function setChecked(el: HTMLInputElement, checked: boolean): void {
  el.checked = checked
  dispatch(el, 'input')
  dispatch(el, 'change')
}

function setNativeValue(el: Fillable, value: string): void {
  const proto = Object.getPrototypeOf(el) as object
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) descriptor.set.call(el, value)
  else (el as HTMLInputElement).value = value
}

function dispatch(el: Element, type: 'input' | 'change' | 'blur'): void {
  el.dispatchEvent(new Event(type, { bubbles: true }))
}

/** First element matching any selector candidate, searched across open shadow roots. */
function findElement(root: Document | ShadowRoot, selectors: string[]): Fillable | null {
  for (const selector of selectors) {
    const found = deepQuery(root, selector)
    if (found) return found
  }
  return null
}

function deepQuery(root: Document | ShadowRoot, selector: string): Fillable | null {
  let match: Element | null
  try {
    match = root.querySelector(selector)
  } catch {
    match = null // invalid/structural selector — skip
  }
  if (match) return match as Fillable

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) {
      const inner = deepQuery(shadow, selector)
      if (inner) return inner
    }
  }
  return null
}

const success = (detectedFieldId: string, acceptedValue: string | null): FillResult => ({
  detectedFieldId,
  status: 'success',
  acceptedValue,
})
const skip = (detectedFieldId: string, reason: string): FillResult => ({
  detectedFieldId,
  status: 'skipped',
  reason,
})
const fail = (detectedFieldId: string, reason: string): FillResult => ({
  detectedFieldId,
  status: 'failed',
  reason,
})
