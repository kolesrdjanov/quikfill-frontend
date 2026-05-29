import { z } from 'zod'
import { isoDateTime, timestamps, uuid } from './common'
import { fillSourceSchema } from './fill-source'

/**
 * How a value is applied to a field in the DOM.
 * `assistedAutocomplete` types into an autocomplete-driven input (e.g. Google
 * Places) to surface its suggestion dropdown for the user to pick from — it
 * deliberately does not "complete" the field, since selecting a result is what
 * populates the site's dependent fields.
 */
export const fillStrategySchema = z.enum([
  'nativeInput',
  'select',
  'clickToggle',
  'customSelect',
  'assistedAutocomplete',
])
export type FillStrategy = z.infer<typeof fillStrategySchema>

/** Resolved field descriptor — how to find the field again (FieldMapping.target). */
export const fieldMappingTargetSchema = z.object({
  selectorCandidates: z.array(z.string()).default([]),
  fieldFingerprint: z.string(),
  frame: z.string().default('main'),
  shadow: z.boolean().default(false),
})
export type FieldMappingTarget = z.infer<typeof fieldMappingTargetSchema>

/** Loose semantic hints captured at save time to aid re-matching. */
export const semanticHintsSchema = z
  .object({
    label: z.string().optional(),
    autocomplete: z.string().optional(),
    ariaLabel: z.string().optional(),
  })
  .catchall(z.string())
export type SemanticHints = z.infer<typeof semanticHintsSchema>

/** A saved mapping from a fingerprinted field to a fill source + strategy. */
export const fieldMappingSchema = z.object({
  id: uuid,
  formProfileId: uuid,
  fieldFingerprint: z.string(),
  selectorCandidates: z.array(z.string()).default([]),
  semanticHints: semanticHintsSchema.optional(),
  target: fieldMappingTargetSchema,
  fillSource: fillSourceSchema,
  fillStrategy: fillStrategySchema,
  confidence: z.number().min(0).max(1).default(0),
  lastSuccessfulFillAt: isoDateTime.optional(),
  ...timestamps,
})
export type FieldMapping = z.infer<typeof fieldMappingSchema>
