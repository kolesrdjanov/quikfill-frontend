import { z } from 'zod'
import { nullableOptional, timestamps, uuid } from './common'

/** Field value types an entity field can hold. Mirrors the backend EntityFieldDef.type. */
export const entityFieldTypeSchema = z.enum([
  'text',
  'number',
  'boolean',
  'date',
  'email',
  'phone',
  'enum',
  'address',
  'currency',
  'notes',
])
export type EntityFieldType = z.infer<typeof entityFieldTypeSchema>

/** One field definition within an EntityType (element of `EntityType.fields`). */
export const entityFieldDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: entityFieldTypeSchema,
  required: z.boolean().default(false),
  /** Allowed values when `type === 'enum'`. */
  options: z.array(z.string()).optional(),
})
export type EntityFieldDef = z.infer<typeof entityFieldDefSchema>

/** A reusable record shape the user defines (e.g. "Person", "Company"). */
export const entityTypeSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  description: nullableOptional(z.string()),
  fields: z.array(entityFieldDefSchema),
  ...timestamps,
})
export type EntityType = z.infer<typeof entityTypeSchema>

/**
 * A concrete record of an EntityType. `values` is keyed by EntityFieldDef.key;
 * key validity against the parent type is enforced at the service layer.
 */
export const entityRecordSchema = z.object({
  id: uuid,
  entityTypeId: uuid,
  name: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  ...timestamps,
})
export type EntityRecord = z.infer<typeof entityRecordSchema>
