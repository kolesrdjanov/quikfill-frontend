import { z } from 'zod'
import { entityRecordSchema, entityTypeSchema } from './entity'
export const savedLibrarySchema = z.object({
  ownerId: z.string().uuid(),
  syncedAt: z.string().datetime(),
  types: z.array(entityTypeSchema),
  records: z.array(entityRecordSchema),
})
export type SavedLibrary = z.infer<typeof savedLibrarySchema>
export const savedSelectionSchema = z.object({
  ownerId: z.string().uuid(),
  recordId: z.string().uuid(),
})
export const savedRecordSnapshotSchema = z
  .object({ ownerId: z.string().uuid(), type: entityTypeSchema, record: entityRecordSchema })
  .refine((snapshot) => snapshot.record.entityTypeId === snapshot.type.id, {
    message: 'Record does not belong to the selected type.',
  })
export type SavedRecordSnapshot = z.infer<typeof savedRecordSnapshotSchema>
