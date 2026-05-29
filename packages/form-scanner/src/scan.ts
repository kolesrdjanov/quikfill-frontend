import type { DetectedField, ScanLimitation, ScanOptions, ScanResult } from '@quikfill/schemas'
import {
  getAriaLabel,
  getAriaLabelledByText,
  getCurrentValue,
  getInputType,
  getLabelText,
  getNearbyText,
  getOptions,
  getSectionHeading,
  getSelectorCandidates,
  isFormControl,
  isVisible,
  type FormControl,
} from './extract'
import { fingerprint, structureHash } from './fingerprint'

interface FrameContext {
  frame: string
  shadow: boolean
  root: Document | ShadowRoot
}

/**
 * Scan a document (and its open shadow roots + same-origin iframes) for fillable
 * fields. Returns DetectedField[] plus honest limitations for anything that
 * could not be reached. Pure DOM — no Chrome, no Vue.
 */
export function scanForms(
  doc: Document = document,
  options: ScanOptions = { includeHidden: false },
): ScanResult {
  const fields: DetectedField[] = []
  const limitations: ScanLimitation[] = []
  let counter = 0
  let frameCounter = 0

  const visit = (ctx: FrameContext): void => {
    // Walk every element so we both detect controls and find open shadow hosts.
    const elements = ctx.root.querySelectorAll('*')
    for (const el of Array.from(elements)) {
      if (isFormControl(el)) {
        const field = buildField(el, ctx, `qf-${counter}`)
        if (options.includeHidden || field.visible) {
          fields.push(field)
          counter++
        }
      }
      // Descend into an open shadow root if present.
      const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
      if (shadow) {
        visit({ frame: ctx.frame, shadow: true, root: shadow })
      }
    }

    // Same-origin iframes only; cross-origin access throws → reported.
    for (const frame of Array.from(ctx.root.querySelectorAll('iframe'))) {
      const iframe = frame as HTMLIFrameElement
      try {
        const innerDoc = iframe.contentDocument
        if (innerDoc) {
          visit({ frame: `frame:${frameCounter++}`, shadow: ctx.shadow, root: innerDoc })
        } else {
          limitations.push({
            kind: 'crossOriginFrame',
            detail: `Cannot read iframe ${iframe.src || '(no src)'} — likely cross-origin.`,
          })
        }
      } catch {
        limitations.push({
          kind: 'crossOriginFrame',
          detail: `Cross-origin iframe ${iframe.src || '(no src)'} is not accessible.`,
        })
      }
    }
  }

  visit({ frame: 'main', shadow: false, root: doc })

  return {
    fields,
    limitations,
    structureHash: structureHash(fields),
  }
}

function buildField(el: FormControl, ctx: FrameContext, id: string): DetectedField {
  const inputType = getInputType(el)
  const labelText = getLabelText(el, ctx.root)
  const name = el.getAttribute('name') ?? undefined
  const options = getOptions(el)
  const sectionHeading = getSectionHeading(el)
  const fp = fingerprint({
    label: labelText,
    name,
    type: inputType,
    options: options?.map((o) => o.label),
    section: sectionHeading,
  })
  const asInput = el as HTMLInputElement

  return {
    id,
    tagName: el.tagName.toLowerCase(),
    inputType,
    currentValue: getCurrentValue(el),
    required: el.hasAttribute('required') || asInput.required === true,
    disabled: el.hasAttribute('disabled') || asInput.disabled === true,
    readonly: el.hasAttribute('readonly') || asInput.readOnly === true,
    visible: isVisible(el),
    name,
    domId: el.getAttribute('id') ?? undefined,
    classNames: (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
    placeholder: el.getAttribute('placeholder') ?? undefined,
    autocomplete: el.getAttribute('autocomplete') ?? undefined,
    ariaLabel: getAriaLabel(el),
    ariaLabelledByText: getAriaLabelledByText(el, ctx.root),
    labelText,
    nearbyText: getNearbyText(el),
    sectionHeading,
    options,
    selectorCandidates: getSelectorCandidates(el),
    domFingerprint: fp.hash,
    frame: ctx.frame,
    shadow: ctx.shadow,
  }
}
