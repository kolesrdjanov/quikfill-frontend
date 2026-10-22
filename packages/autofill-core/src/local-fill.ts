import type { DetectedField, FillInstruction, FillPlan, FillResult } from '@quikfill/schemas'
import { buildPreviewPlan, type PreviewOptions } from './plan'
import { classifySensitive } from './sensitive'

export interface LocalFillOptions extends Pick<PreviewOptions, 'seed' | 'locale'> {
  /** Preserve existing selections and values unless explicitly disabled. */
  onlyEmpty?: boolean
}

/** Used before probing too: preserved widgets must not be opened or changed. */
export function localFillSkipReason(
  field: DetectedField,
  opts: LocalFillOptions = {},
): string | null {
  if (
    field.disabled ||
    (field.readonly && field.customWidget?.kind !== 'datepicker') ||
    !field.visible
  )
    return 'Field is unavailable for editing.'
  if (classifySensitive(field)) return 'Sensitive field — fill it manually.'
  if (
    (opts.onlyEmpty ?? true) &&
    field.currentValue !== null &&
    field.currentValue !== undefined &&
    field.currentValue !== ''
  )
    return 'Existing value preserved (only empty fields).'
  if (field.customWidget?.remoteOptions)
    return 'Options were not available — select a value manually.'
  return null
}

/** Shared conversion for local plans. Unresolved/confirmation items never execute. */
export function planToFillInstructions(plan: FillPlan, fields: DetectedField[]): FillInstruction[] {
  const byId = new Map(fields.map((field) => [field.id, field]))
  return plan.items.flatMap((item) => {
    const field = byId.get(item.detectedFieldId)
    if (!field || item.requiresConfirmation || !item.proposedValue) return []
    return [
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        tagName: field.tagName,
        inputType: field.inputType,
        fillStrategy: item.fillStrategy,
        proposedValue: item.proposedValue,
        customWidget: field.customWidget,
      },
    ]
  })
}

/** Pure, offline sample-data entry point. No account, storage, or AI dependency. */
export function buildLocalFillPlan(
  fields: DetectedField[],
  opts: LocalFillOptions = {},
): {
  plan: FillPlan
  instructions: FillInstruction[]
  skipped: FillResult[]
} {
  const skipped: FillResult[] = []
  const eligible = fields.filter((field) => {
    const reason = localFillSkipReason(field, opts)
    if (reason) skipped.push({ detectedFieldId: field.id, status: 'skipped', reason })
    return !reason
  })
  const plan = buildPreviewPlan(eligible, { ...opts, allowSampleData: true })
  for (const item of plan.items) {
    if (item.requiresConfirmation || !item.proposedValue)
      skipped.push({
        detectedFieldId: item.detectedFieldId,
        status: 'skipped',
        reason:
          item.fillSource.sourceType === 'aiGenerated'
            ? 'No local generator matches this field. Fill it manually or use AI assist.'
            : (item.warnings[0] ?? 'No valid local value is available.'),
      })
  }
  return { plan, instructions: planToFillInstructions(plan, eligible), skipped }
}
