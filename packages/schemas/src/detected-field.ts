import { z } from 'zod'

/** A selectable option on a select/radio/checkbox group. */
export const fieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  selected: z.boolean().optional(),
})
export type FieldOption = z.infer<typeof fieldOptionSchema>

/**
 * The stable inputs a fingerprint is hashed from, plus the hash itself.
 * Hashing lives in `form-scanner`; this is just the contract for the result.
 */
export const fieldFingerprintSchema = z.object({
  hash: z.string(),
  inputs: z.object({
    label: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    options: z.array(z.string()).optional(),
    section: z.string().optional(),
  }),
})
export type FieldFingerprint = z.infer<typeof fieldFingerprintSchema>

/**
 * A single field discovered by the scanner. Carries everything the planner and
 * the (privacy-aware) AI summary builder need. `currentValue` never leaves the
 * page unredacted.
 */
export const detectedFieldSchema = z.object({
  /** Scanner-assigned id, unique within a scan. */
  id: z.string().min(1),
  tagName: z.string(),
  inputType: z.string(),
  currentValue: z.string().nullable().optional(),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  readonly: z.boolean().default(false),
  visible: z.boolean().default(true),
  name: z.string().optional(),
  /** The element's DOM `id` attribute (distinct from the scanner `id`). */
  domId: z.string().optional(),
  classNames: z.array(z.string()).default([]),
  placeholder: z.string().optional(),
  autocomplete: z.string().optional(),
  ariaLabel: z.string().optional(),
  ariaLabelledByText: z.string().optional(),
  labelText: z.string().optional(),
  nearbyText: z.string().optional(),
  sectionHeading: z.string().optional(),
  options: z.array(fieldOptionSchema).optional(),
  selectorCandidates: z.array(z.string()).default([]),
  domFingerprint: z.string(),
  /** `'main'` for the top document, otherwise an opaque frame id. */
  frame: z.string().default('main'),
  /** True when the field lives inside an (open) shadow root. */
  shadow: z.boolean().default(false),
})
export type DetectedField = z.infer<typeof detectedFieldSchema>
