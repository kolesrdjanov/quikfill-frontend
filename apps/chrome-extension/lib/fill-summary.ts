import type { DetectedField, FillResult } from '@quikfill/schemas'

/** Count every detected target, including omitted AI values and unsupported picks. */
export function summarizeFill(fields: DetectedField[], results: FillResult[]) {
  const byId = new Map(results.map((result) => [result.detectedFieldId, result]))
  const completeResults = fields.map(
    (field): FillResult =>
      byId.get(field.id) ?? {
        detectedFieldId: field.id,
        status: 'skipped',
        reason: field.customWidget?.remoteOptions
          ? 'Options were not available — select a value manually.'
          : 'No value was proposed for this field.',
      },
  )
  const count = (status: FillResult['status']): number =>
    completeResults.filter((r) => r.status === status).length
  const filled = count('success')
  const assisted = count('assisted')
  const failed = count('failed')
  const skipped = count('skipped')
  const total = fields.length
  return {
    results: completeResults,
    filled,
    assisted,
    failed,
    skipped,
    total,
    complete: total > 0 && filled === total,
    label: filled === total && total > 0 ? 'Filled' : `${filled}/${total} filled`,
    description: [
      `${filled}/${total} filled`,
      assisted ? `${assisted} need your input` : '',
      failed ? `${failed} failed` : '',
      skipped ? `${skipped} skipped` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}
