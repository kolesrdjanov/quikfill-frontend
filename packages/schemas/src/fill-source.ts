import { z } from 'zod'

/**
 * Where a field's proposed value comes from. Discriminated on `sourceType`.
 * Mirrors the backend FillSource union exactly (stored on FieldMapping.fillSource).
 * `composed` is recursive: it builds a value from a template + nested sources.
 */
export type FillSource =
  | { sourceType: 'recordField'; entityTypeId: string; recordId?: string; fieldKey: string }
  | { sourceType: 'generatorRule'; presetId?: string; ruleKey: string }
  | { sourceType: 'staticValue'; value: string }
  | { sourceType: 'runtimeValue'; promptLabel: string }
  | { sourceType: 'aiGenerated'; hint: string }
  | { sourceType: 'composed'; template: string; parts: FillSource[] }

const recordFieldFillSourceSchema = z.object({
  sourceType: z.literal('recordField'),
  entityTypeId: z.string().min(1),
  recordId: z.string().optional(),
  fieldKey: z.string().min(1),
})

const generatorRuleFillSourceSchema = z.object({
  sourceType: z.literal('generatorRule'),
  presetId: z.string().optional(),
  ruleKey: z.string().min(1),
})

const staticValueFillSourceSchema = z.object({
  sourceType: z.literal('staticValue'),
  value: z.string(),
})

const runtimeValueFillSourceSchema = z.object({
  sourceType: z.literal('runtimeValue'),
  promptLabel: z.string().min(1),
})

const aiGeneratedFillSourceSchema = z.object({
  sourceType: z.literal('aiGenerated'),
  hint: z.string().min(1),
})

const composedFillSourceSchema = z.object({
  sourceType: z.literal('composed'),
  template: z.string(),
  parts: z.array(z.lazy((): z.ZodType<FillSource> => fillSourceSchema)),
})

export const fillSourceSchema: z.ZodType<FillSource> = z.discriminatedUnion('sourceType', [
  recordFieldFillSourceSchema,
  generatorRuleFillSourceSchema,
  staticValueFillSourceSchema,
  runtimeValueFillSourceSchema,
  aiGeneratedFillSourceSchema,
  composedFillSourceSchema,
])

export const fillSourceTypeSchema = z.enum([
  'recordField',
  'generatorRule',
  'staticValue',
  'runtimeValue',
  'aiGenerated',
  'composed',
])
export type FillSourceType = z.infer<typeof fillSourceTypeSchema>
