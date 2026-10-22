import type { DetectedField, GeneratorRule } from '@quikfill/schemas'

/** Constrain a per-field copy; never mutate a shared semantic rule. */
export function constrainRule(rule: GeneratorRule, field: DetectedField): GeneratorRule {
  if (field.mask) return { ...rule, kind: 'patterned', options: { format: field.mask } }
  const options = { ...rule.options }
  if (rule.kind === 'number') {
    const min = field.min !== undefined ? Number(field.min) : undefined
    const max = field.max !== undefined ? Number(field.max) : undefined
    if (min !== undefined && Number.isFinite(min)) options.min = min
    if (max !== undefined && Number.isFinite(max)) options.max = max
    if (options.min === undefined && max !== undefined) options.min = Math.min(0, max)
    if (options.max === undefined && min !== undefined) options.max = Math.max(1000, min)
    options.step = field.step === 'any' ? 0 : Number(field.step ?? 1)
    options.stepBase = Number(field.stepBase ?? field.min ?? 0)
    if (field.step === 'any') options.decimals = 2
  }
  if (rule.kind === 'date') {
    if (field.min) options.min = field.min
    if (field.max) options.max = field.max
    options.step = field.step === 'any' ? 1 : Number(field.step ?? 1)
    options.stepBase = Date.parse(field.stepBase ?? field.min ?? '1970-01-01') / 86_400_000
  }
  if (rule.kind === 'boolean' && field.required) options.falseValue = 'true'
  if (rule.kind === 'patterned' && field.mask) options.format = field.mask
  return { ...rule, options }
}

/** Keep invalid generated text out of the executor; final DOM validation still runs. */
export function generatedValueIssue(value: string, field: DetectedField): string | null {
  if (!value) return 'No valid local value is available for this field.'
  if (field.minLength !== undefined && value.length < field.minLength)
    return 'Local value is shorter than the required minimum length.'
  if (field.maxLength !== undefined && value.length > field.maxLength)
    return 'Local value exceeds the maximum length.'
  if (field.pattern) {
    try {
      if (!new RegExp(`^(?:${field.pattern})$`, 'v').test(value))
        return 'Local value does not match the field pattern. Fill this field manually.'
    } catch {
      // HTML ignores invalid patterns too. The live executor checks validity.
    }
  }
  return null
}
