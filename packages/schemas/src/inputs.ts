import { z } from 'zod'
import { entityRecordSchema, entityTypeSchema } from './entity'
import { generatorPresetSchema } from './generator'
import { domainSchema, formProfileSchema } from './form-profile'
import { fieldMappingSchema } from './field-mapping'

/* ── Entity types ─────────────────────────────────────────────────────────── */
export const createEntityTypeInputSchema = entityTypeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateEntityTypeInput = z.infer<typeof createEntityTypeInputSchema>
export const updateEntityTypeInputSchema = createEntityTypeInputSchema.partial()
export type UpdateEntityTypeInput = z.infer<typeof updateEntityTypeInputSchema>

/* ── Entity records ───────────────────────────────────────────────────────── */
export const createEntityRecordInputSchema = entityRecordSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateEntityRecordInput = z.infer<typeof createEntityRecordInputSchema>
export const updateEntityRecordInputSchema = entityRecordSchema
  .omit({ id: true, entityTypeId: true, createdAt: true, updatedAt: true })
  .partial()
export type UpdateEntityRecordInput = z.infer<typeof updateEntityRecordInputSchema>

/* ── Generator presets ────────────────────────────────────────────────────── */
export const createGeneratorPresetInputSchema = generatorPresetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateGeneratorPresetInput = z.infer<typeof createGeneratorPresetInputSchema>
export const updateGeneratorPresetInputSchema = createGeneratorPresetInputSchema.partial()
export type UpdateGeneratorPresetInput = z.infer<typeof updateGeneratorPresetInputSchema>

/* ── Domains ──────────────────────────────────────────────────────────────── */
// `id` is optional on create: the local-first clients (extension) supply the
// UUID they already minted so a backend push is idempotent (upsert on that id);
// the dashboard omits it and lets the server assign one. See common.ts `uuid`.
export const createDomainInputSchema = domainSchema
  .omit({ createdAt: true, updatedAt: true })
  .partial({ id: true })
export type CreateDomainInput = z.infer<typeof createDomainInputSchema>
export const updateDomainInputSchema = createDomainInputSchema.omit({ id: true }).partial()
export type UpdateDomainInput = z.infer<typeof updateDomainInputSchema>

/* ── Form profiles ────────────────────────────────────────────────────────── */
export const createFormProfileInputSchema = formProfileSchema
  .omit({ createdAt: true, updatedAt: true })
  .partial({ id: true })
export type CreateFormProfileInput = z.infer<typeof createFormProfileInputSchema>
export const updateFormProfileInputSchema = formProfileSchema
  .omit({ id: true, domainId: true, createdAt: true, updatedAt: true })
  .partial()
export type UpdateFormProfileInput = z.infer<typeof updateFormProfileInputSchema>

/* ── Field mappings ───────────────────────────────────────────────────────── */
export const createFieldMappingInputSchema = fieldMappingSchema
  .omit({
    formProfileId: true,
    lastSuccessfulFillAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial({ id: true })
export type CreateFieldMappingInput = z.infer<typeof createFieldMappingInputSchema>
export const updateFieldMappingInputSchema = createFieldMappingInputSchema.partial()
export type UpdateFieldMappingInput = z.infer<typeof updateFieldMappingInputSchema>
