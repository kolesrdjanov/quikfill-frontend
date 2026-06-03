import {
  aiFillFieldSchema,
  aiFillRequestSchema,
  fillInstructionSchema,
  type AiFillField,
  type AiFillPreferences,
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
 * A truly native fillable input (text / select / checkbox / radio / …). A custom
 * widget (a `<div>`-based dropdown, or a probed datepicker input) is NOT native —
 * see {@link isFillableField}, which the in-page flow uses so it also fills
 * detected custom widgets.
 */
export function isNativeFillable(field: DetectedField): boolean {
  return !field.customWidget && field.inputType !== 'customSelect'
}

/**
 * A field the in-page flow can fill end-to-end: any native input, PLUS any field
 * carrying a click-driving `customWidget` descriptor (a custom select the filler
 * opens and picks from, or a probed datepicker it types/clicks a date into). A
 * custom select with no descriptor can't be driven, so it stays excluded.
 */
export function isFillableField(field: DetectedField): boolean {
  if (isNativeFillable(field)) return true
  return !!field.customWidget
}

/**
 * Whether a field's VALUE comes from the AI. Custom selects (single and multi)
 * don't: their value set is harvested by the scan-time probe and picked locally
 * (see {@link localPickInstructions}) — sending them to the model just invites a
 * label that doesn't exist. Datepicker widgets DO go to the AI (it proposes a
 * date honoring the probed min/max); so does every native input.
 */
export function isAiFillableField(field: DetectedField): boolean {
  if (!isFillableField(field)) return false
  const kind = field.customWidget?.kind
  return kind !== 'select' && kind !== 'multiselect'
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
    ...(field.min ? { min: field.min.slice(0, MAX_SUMMARY_TEXT) } : {}),
    ...(field.max ? { max: field.max.slice(0, MAX_SUMMARY_TEXT) } : {}),
  })
}

/**
 * Build the redacted `/ai/fill` request from page globals + detected fields.
 * Native inputs plus probed datepickers (see {@link isAiFillableField}; custom
 * selects are picked locally instead — {@link localPickInstructions}); every text
 * field is HTML-stripped and length-capped, and the current value is never
 * included — the same privacy guarantee as classify. Returns null when nothing
 * AI-fillable remains (e.g. a form of only dropdowns) — the caller skips the AI
 * round-trip entirely.
 *
 * `preferences` is forwarded only when it carries something the model should act
 * on: the chosen `locale` is always forwarded, while a `dateFormat` of `'auto'`
 * (or none) is omitted, so callers that pass neither keep the default wire shape.
 */
export function buildAiFillRequest(
  page: AiFillPageInput,
  fields: DetectedField[],
  preferences?: AiFillPreferences,
): AiFillRequest | null {
  const fillable = fields.filter(isAiFillableField)
  if (fillable.length === 0) return null
  const dateFormat = preferences?.dateFormat
  // Forward only the preferences the model should act on: a chosen `locale`, and a
  // non-`auto` `dateFormat`. Omit `preferences` entirely when neither applies, so
  // the default wire shape (and existing callers) stay unchanged.
  const prefs = {
    ...(preferences?.locale ? { locale: preferences.locale } : {}),
    ...(dateFormat && dateFormat !== 'auto' ? { dateFormat } : {}),
  }
  return aiFillRequestSchema.parse({
    page: {
      lang: page.lang?.slice(0, MAX_SUMMARY_TEXT) ?? '',
      title: redactText(page.title) ?? '',
      description: redactText(page.description) ?? '',
    },
    fields: fillable.map(toAiFillField),
    ...(Object.keys(prefs).length > 0 ? { preferences: prefs } : {}),
  })
}

function strategyFor(field: DetectedField): FillStrategy {
  // Any field with a widget descriptor is click-driven — including a probed
  // datepicker whose element is a native `<input>` (the descriptor's kind routes
  // it to the type-or-click-a-date path inside the filler).
  if (field.customWidget || field.inputType === 'customSelect') return 'customSelect'
  if (field.inputType === 'select') return 'select'
  if (field.inputType === 'checkbox' || field.inputType === 'radio') return 'clickToggle'
  return 'nativeInput'
}

/** Build one fill instruction for a field + proposed value. */
function toInstruction(field: DetectedField, value: string): FillInstruction {
  return fillInstructionSchema.parse({
    detectedFieldId: field.id,
    selectorCandidates: field.selectorCandidates,
    frame: field.frame,
    shadow: field.shadow,
    tagName: field.tagName,
    inputType: field.inputType,
    fillStrategy: strategyFor(field),
    ...(field.customWidget ? { customWidget: field.customWidget } : {}),
    proposedValue: value,
  })
}

/**
 * Local (no-AI) instructions for custom selects whose options the probe harvested:
 * pick a RANDOM option from the real value set and click-drive it. Remote selects
 * (options never rendered — `remoteOptions`) and widgets with nothing harvested
 * yield no instruction: they are left blank, never guessed at. Datepickers are
 * excluded — their value comes from the AI (see {@link isAiFillableField}).
 */
export function localPickInstructions(fields: DetectedField[]): FillInstruction[] {
  const instructions: FillInstruction[] = []
  for (const field of fields) {
    const widget = field.customWidget
    if (!widget || (widget.kind !== 'select' && widget.kind !== 'multiselect')) continue
    if (widget.remoteOptions) continue
    const labels = (field.options ?? []).map((o) => o.label).filter((l) => l.trim() !== '')
    if (labels.length === 0) continue
    const pick = labels[Math.floor(Math.random() * labels.length)]
    instructions.push(toInstruction(field, pick))
  }
  return instructions
}

/**
 * Map AI fill values back to fill instructions, keyed by the `fieldId` the request
 * sent (= scanner `data-qf-id`). Drops values for unknown ids or non-AI-fillable
 * fields, so a hallucinated id can never target an element (custom selects are
 * locally picked — an AI value for one is ignored). The picked strategy lets the
 * filler value-match native selects, toggle checkboxes/radios, and — for a probed
 * datepicker — type or calendar-click the date (its `customWidget` descriptor is
 * carried through so the filler knows how to drive it).
 */
export function valuesToFillInstructions(
  values: { fieldId: string; value: string }[],
  fields: DetectedField[],
): FillInstruction[] {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const instructions: FillInstruction[] = []
  for (const { fieldId, value } of values) {
    const field = byId.get(fieldId)
    if (!field || !isAiFillableField(field)) continue
    instructions.push(toInstruction(field, value))
  }
  return instructions
}
