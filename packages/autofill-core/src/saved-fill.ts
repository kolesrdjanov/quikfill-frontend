import type { DetectedField, FillResult, SavedRecordSnapshot } from '@quikfill/schemas'
import { classifyField } from './classify'
import { semanticTypeForEntityField } from './record-index'
import { localFillSkipReason, planToFillInstructions } from './local-fill'
import { buildFillPlan } from './plan'

/** One explicitly selected real record. No sample/AI fallback, no implicit overwrite. */
export function buildSavedFillPlan(fields: DetectedField[], snapshot: SavedRecordSnapshot) {
  if (snapshot.record.entityTypeId !== snapshot.type.id)
    throw new Error('Saved record type mismatch.')
  const skipped: FillResult[] = []
  const assignments = fields.flatMap((field) => {
    const reason = localFillSkipReason(field, { onlyEmpty: true })
    if (reason) {
      skipped.push({ detectedFieldId: field.id, status: 'skipped', reason })
      return []
    }
    const semantic = classifyField(field).semanticType
    const candidates = snapshot.type.fields.filter(
      (f) => semantic !== 'unknown' && semanticTypeForEntityField(f) === semantic,
    )
    if (candidates.length !== 1) {
      skipped.push({
        detectedFieldId: field.id,
        status: 'skipped',
        reason: candidates.length
          ? 'Saved record has ambiguous matching fields.'
          : 'No saved value matches this field.',
      })
      return []
    }
    const value = snapshot.record.values[candidates[0].key]
    if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).trim() === '') {
      skipped.push({
        detectedFieldId: field.id,
        status: 'skipped',
        reason: 'No saved value matches this field.',
      })
      return []
    }
    return [{ field, fillSource: { sourceType: 'staticValue' as const, value: String(value) } }]
  })
  const plan = buildFillPlan(assignments)
  return { plan, instructions: planToFillInstructions(plan, fields), skipped }
}
