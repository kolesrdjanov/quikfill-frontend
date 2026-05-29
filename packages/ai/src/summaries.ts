import { fieldSummarySchema, type DetectedField, type FieldSummary } from '@quikfill/schemas'

/** Max characters kept for any single text field in a summary. */
export const MAX_SUMMARY_TEXT = 300
/** Max number of options forwarded for a select/radio/checkbox group. */
export const MAX_SUMMARY_OPTIONS = 50

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
 * Build the minimized, redacted summaries sent to the AI classifier. The current
 * value and raw HTML never leave the page: values are dropped entirely and every
 * text field is HTML-stripped and length-capped before it can reach the wire.
 */
export function buildFieldSummaries(fields: DetectedField[]): FieldSummary[] {
  return fields.map((field) => {
    const label = redactText(field.labelText ?? field.ariaLabel ?? field.placeholder)
    const options = field.options
      ?.slice(0, MAX_SUMMARY_OPTIONS)
      .map((o) => redactText(o.label))
      .filter((o): o is string => o !== undefined)

    return fieldSummarySchema.parse({
      fieldId: field.id,
      inputType: field.inputType,
      ...(label !== undefined ? { label } : {}),
      ...(field.autocomplete
        ? { autocomplete: field.autocomplete.slice(0, MAX_SUMMARY_TEXT) }
        : {}),
      ...(options && options.length ? { options } : {}),
      ...(redactText(field.nearbyText) !== undefined
        ? { nearbyText: redactText(field.nearbyText) }
        : {}),
      ...(redactText(field.sectionHeading) !== undefined
        ? { sectionHeading: redactText(field.sectionHeading) }
        : {}),
    })
  })
}
