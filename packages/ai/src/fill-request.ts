import {
  aiFillFieldSchema,
  aiFillRequestSchema,
  fillInstructionSchema,
  type AiFillField,
  type AiFillRequest,
  type DetectedField,
  type FillInstruction,
  type FillStrategy,
} from '@quikfill/schemas'
import { MAX_SUMMARY_OPTIONS, MAX_SUMMARY_TEXT } from './summaries'

/** Page globals the overlay reads off the document; all optional, defaulted to ''. */
export interface AiFillPageInput {
  lang?: string
  title?: string
  description?: string
}

/** Strip HTML tags, collapse whitespace, and cap length. Returns undefined when empty. */
function redactText(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  return text.slice(0, MAX_SUMMARY_TEXT)
}

/**
 * Native fillable field only. Custom widgets / non-native selects are out of
 * scope for the in-page fill flow, so they never reach the request or the filler.
 */
export function isNativeFillable(field: DetectedField): boolean {
  return !field.customWidget && field.inputType !== 'customSelect'
}

/** DetectedField → redacted AiFillField. NEVER carries the current value or raw HTML. */
function toAiFillField(field: DetectedField): AiFillField {
  const label = redactText(field.labelText ?? field.ariaLabelledByText ?? field.ariaLabel)
  const placeholder = redactText(field.placeholder)
  const ariaLabel = redactText(field.ariaLabel)
  const options = field.options
    ?.slice(0, MAX_SUMMARY_OPTIONS)
    .map((o) => redactText(o.label))
    .filter((o): o is string => o !== undefined)

  return aiFillFieldSchema.parse({
    fieldId: field.id,
    inputType: field.inputType,
    required: field.required,
    ...(label !== undefined ? { label } : {}),
    ...(field.name ? { name: field.name.slice(0, MAX_SUMMARY_TEXT) } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(field.autocomplete ? { autocomplete: field.autocomplete.slice(0, MAX_SUMMARY_TEXT) } : {}),
    ...(ariaLabel !== undefined ? { ariaLabel } : {}),
    ...(field.pattern ? { pattern: field.pattern.slice(0, MAX_SUMMARY_TEXT) } : {}),
    ...(options && options.length ? { options } : {}),
  })
}

/**
 * Build the redacted `/ai/fill` request from page globals + detected fields.
 * Native inputs only; every text field is HTML-stripped and length-capped, and
 * the current value is never included — the same privacy guarantee as classify.
 * Throws if no native fields remain (an empty request is meaningless).
 */
export function buildAiFillRequest(page: AiFillPageInput, fields: DetectedField[]): AiFillRequest {
  const native = fields.filter(isNativeFillable)
  return aiFillRequestSchema.parse({
    page: {
      lang: page.lang?.slice(0, MAX_SUMMARY_TEXT) ?? '',
      title: redactText(page.title) ?? '',
      description: redactText(page.description) ?? '',
    },
    fields: native.map(toAiFillField),
  })
}

function strategyFor(inputType: string): FillStrategy {
  if (inputType === 'select') return 'select'
  if (inputType === 'checkbox' || inputType === 'radio') return 'clickToggle'
  return 'nativeInput'
}

/**
 * Map AI fill values back to fill instructions, keyed by the `fieldId` the request
 * sent (= scanner `data-qf-id`). Drops values for unknown ids or non-native fields,
 * so a hallucinated id can never target an element. The picked strategy lets the
 * filler value-match selects and toggle checkboxes/radios correctly.
 */
export function valuesToFillInstructions(
  values: { fieldId: string; value: string }[],
  fields: DetectedField[],
): FillInstruction[] {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const instructions: FillInstruction[] = []
  for (const { fieldId, value } of values) {
    const field = byId.get(fieldId)
    if (!field || !isNativeFillable(field)) continue
    instructions.push(
      fillInstructionSchema.parse({
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        tagName: field.tagName,
        inputType: field.inputType,
        fillStrategy: strategyFor(field.inputType),
        proposedValue: value,
      }),
    )
  }
  return instructions
}
