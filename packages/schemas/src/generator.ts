import { z } from 'zod'
import { timestamps, uuid } from './common'

/** Generator kinds in the catalog. Mirrors the backend GeneratorRule.kind. */
export const generatorKindSchema = z.enum([
  'person',
  'email',
  'phone',
  'address',
  'company',
  'unit',
  'number',
  'date',
  'currency',
  'boolean',
  'notes',
  'selectOption',
  'customEnum',
])
export type GeneratorKind = z.infer<typeof generatorKindSchema>

/** One generation rule (element of `GeneratorPreset.rules`). */
export const generatorRuleSchema = z.object({
  fieldKey: z.string().min(1),
  kind: generatorKindSchema,
  /** locale / format / constraints — kind-specific, validated by the generators package. */
  options: z.record(z.string(), z.unknown()).optional(),
})
export type GeneratorRule = z.infer<typeof generatorRuleSchema>

export const seedModeSchema = z.enum(['random', 'seeded'])
export type SeedMode = z.infer<typeof seedModeSchema>

/** A named set of generation rules with locale + optional seed for reproducibility. */
export const generatorPresetSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  locale: z.string().default('en'),
  seedMode: seedModeSchema.default('random'),
  seed: z.string().optional(),
  rules: z.array(generatorRuleSchema),
  ...timestamps,
})
export type GeneratorPreset = z.infer<typeof generatorPresetSchema>
