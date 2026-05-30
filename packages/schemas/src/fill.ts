import { z } from 'zod'
import { isoDateTime, nullableOptional, uuid } from './common'
import { customWidgetSchema } from './detected-field'
import { fillSourceSchema, fillSourceTypeSchema } from './fill-source'
import { fillStrategySchema } from './field-mapping'
import { formProfileMatchCandidateSchema } from './form-profile'

export const fillModeSchema = z.enum(['preview', 'fill'])
export type FillMode = z.infer<typeof fillModeSchema>

/** A single proposed change the user reviews before filling. */
export const fillPlanItemSchema = z.object({
  detectedFieldId: z.string().min(1),
  label: z.string(),
  currentValue: z.string().nullable().optional(),
  proposedValue: z.string(),
  fillSource: fillSourceSchema,
  fillStrategy: fillStrategySchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
  requiresConfirmation: z.boolean().default(false),
})
export type FillPlanItem = z.infer<typeof fillPlanItemSchema>

/** The previewable plan for a scan. */
export const fillPlanSchema = z.object({
  items: z.array(fillPlanItemSchema),
  mode: fillModeSchema,
  profileMatch: formProfileMatchCandidateSchema.optional(),
})
export type FillPlan = z.infer<typeof fillPlanSchema>

/**
 * Per-field fill outcome. `assisted` means we typed into an autocomplete input
 * and the user must pick a result from its dropdown to finish — neither a clean
 * success nor a failure.
 */
export const fillResultStatusSchema = z.enum(['success', 'skipped', 'failed', 'assisted'])
export type FillResultStatus = z.infer<typeof fillResultStatusSchema>

/** The outcome of attempting to fill one field. */
export const fillResultSchema = z.object({
  detectedFieldId: z.string().min(1),
  status: fillResultStatusSchema,
  acceptedValue: z.string().nullable().optional(),
  reason: z.string().optional(),
})
export type FillResult = z.infer<typeof fillResultSchema>

/**
 * Redacted plan item persisted on a FillRun — label, source type, confidence,
 * and strategy only. Never the proposed or current value.
 */
export const redactedFillPlanItemSchema = z.object({
  detectedFieldId: z.string().min(1),
  label: z.string(),
  fillSourceType: fillSourceTypeSchema,
  confidence: z.number().min(0).max(1),
  fillStrategy: fillStrategySchema,
  requiresConfirmation: z.boolean().default(false),
})
export type RedactedFillPlanItem = z.infer<typeof redactedFillPlanItemSchema>

export const fillRunStatusSchema = z.enum(['pending', 'success', 'partial', 'failed'])
export type FillRunStatus = z.infer<typeof fillRunStatusSchema>

/** A recorded fill attempt (history). Aligns 1:1 with the backend FillRun. */
export const fillRunSchema = z.object({
  id: uuid,
  formProfileId: nullableOptional(uuid),
  domainId: nullableOptional(uuid),
  url: z.string(),
  mode: fillModeSchema,
  status: fillRunStatusSchema,
  plan: z.array(redactedFillPlanItemSchema),
  results: z.array(fillResultSchema),
  startedAt: isoDateTime,
  completedAt: nullableOptional(isoDateTime),
  createdAt: isoDateTime.optional(),
})
export type FillRun = z.infer<typeof fillRunSchema>

/**
 * Everything the DOM filler needs to apply one field, sent panel → content.
 * Carries selectors + frame/shadow context (the FillPlanItem itself does not).
 */
export const fillInstructionSchema = z.object({
  detectedFieldId: z.string().min(1),
  selectorCandidates: z.array(z.string()),
  frame: z.string().default('main'),
  shadow: z.boolean().default(false),
  tagName: z.string(),
  inputType: z.string(),
  fillStrategy: fillStrategySchema,
  proposedValue: z.string(),
  /** Click-driving descriptor; required when fillStrategy is 'customSelect'. */
  customWidget: customWidgetSchema.optional(),
})
export type FillInstruction = z.infer<typeof fillInstructionSchema>

/** A captured prior state for one field, enough to restore it on undo. */
export const undoEntrySchema = z.object({
  detectedFieldId: z.string().min(1),
  selectorCandidates: z.array(z.string()),
  frame: z.string().default('main'),
  shadow: z.boolean().default(false),
  /** Field kind, when undo needs it to pick the right restore path (e.g. 'radiogroup'). */
  inputType: z.string().optional(),
  previousValue: z.string().nullable(),
  previousChecked: z.boolean().optional(),
  /** For custom widgets: the displayed selection text before the fill. */
  previousDisplayText: z.string().nullable().optional(),
  /** Echoed so undo can re-drive a custom widget if needed. */
  customWidget: customWidgetSchema.optional(),
})
export type UndoEntry = z.infer<typeof undoEntrySchema>

/** The snapshot taken before a fill, used to undo the most recent fill. */
export const undoSnapshotSchema = z.object({
  entries: z.array(undoEntrySchema),
  capturedAt: isoDateTime.optional(),
})
export type UndoSnapshot = z.infer<typeof undoSnapshotSchema>
