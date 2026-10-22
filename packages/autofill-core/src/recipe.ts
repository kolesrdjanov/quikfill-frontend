import type {
  DetectedField,
  FillRecipe,
  RecipeRule,
  FillInstruction,
  FillResult,
} from '@quikfill/schemas'
import { buildLocalFillPlan, localFillSkipReason } from './local-fill'
import { defaultFillStrategy } from './plan'

/** Values, options, ephemeral scan ids and generated framework DOM ids are not identities. */
export function recipeFieldKey(field: DetectedField): string {
  return JSON.stringify([
    field.frame,
    field.shadow,
    field.tagName,
    field.inputType,
    field.name || field.labelText || field.ariaLabel || field.domId || '',
    field.labelText || field.ariaLabel || '',
  ])
}
export function recipeFormKey(fields: DetectedField[], anchor = ''): string {
  return JSON.stringify([anchor, fields.map(recipeFieldKey).sort()])
}
export function recipeMatches(
  recipe: FillRecipe,
  context: { origin: string; pathname: string; formKey: string },
): boolean {
  return (
    recipe.origin === context.origin &&
    recipe.pathname === context.pathname &&
    recipe.formKey === context.formKey
  )
}
export function defaultRecipeRules(fields: DetectedField[]): RecipeRule[] {
  return fields.map((f) => ({
    fieldKey: recipeFieldKey(f),
    label: f.labelText || f.ariaLabel || f.name || 'Field',
    mode: 'generated',
    value: '',
    case: 'valid',
  }))
}

/** Pure per-control planning: dynamic options are refreshed by the DOM session. */
export function buildRecipeFieldPlan(
  field: DetectedField,
  recipe: FillRecipe,
): { instructions: FillInstruction[]; skipped: FillResult[] } {
  const rule = recipe.rules.find((r) => r.fieldKey === recipeFieldKey(field))
  const skipped = (reason: string) => ({
    instructions: [],
    skipped: [{ detectedFieldId: field.id, status: 'skipped' as const, reason }],
  })
  if (!rule || rule.mode === 'skip') return skipped('Skipped by scenario.')
  const protection = localFillSkipReason(field, { onlyEmpty: recipe.onlyEmpty })
  // Remote options block selection, but never bypass readonly/sensitive/only-empty protection.
  if (protection) return skipped(protection)
  if (rule.mode === 'generated' && rule.case === 'valid')
    return buildLocalFillPlan(
      [
        {
          ...field,
          options: field.options
            ? [...field.options].sort((a, b) =>
                a.value < b.value ? -1 : a.value > b.value ? 1 : 0,
              )
            : undefined,
        },
      ],
      recipe,
    )
  let value: string | null = rule.value
  const invalid = ['invalid', 'belowMinimum', 'aboveMaximum', 'missing'].includes(rule.case)
  if (rule.mode === 'generated' && rule.case === 'invalid')
    return skipped('Use a fixed value to test an arbitrary invalid input.')
  if (rule.mode === 'generated') value = boundaryValue(field, rule.case)
  if (value === null)
    return skipped('This boundary case is not supported for this field or its constraints.')
  if (
    invalid &&
    (field.customWidget ||
      ['radio', 'radiogroup'].includes(field.inputType) ||
      !['input', 'textarea', 'select'].includes(field.tagName))
  )
    return skipped('Expected-invalid scenarios require a native constraint-validation control.')
  if (value === '' && !invalid)
    return skipped('Use the missing case to test an empty required value.')
  const instruction: FillInstruction = {
    detectedFieldId: field.id,
    selectorCandidates: field.selectorCandidates,
    frame: field.frame,
    shadow: field.shadow,
    tagName: field.tagName,
    inputType: field.inputType,
    fillStrategy: defaultFillStrategy(field),
    customWidget: field.customWidget,
    proposedValue: value,
    expectedValidity: invalid ? 'invalid' : 'valid',
    ...(field.customWidget?.kind === 'multiselect' ? { proposedValues: [value] } : {}),
  }
  return { instructions: [instruction], skipped: [] }
}

function boundaryValue(field: DetectedField, variant: RecipeRule['case']): string | null {
  if (variant === 'missing') return ''
  const lower = variant === 'minimum' || variant === 'belowMinimum'
  const outside = variant === 'belowMinimum' || variant === 'aboveMaximum'
  if (field.inputType === 'number' || field.inputType === 'range') {
    const raw = lower ? field.min : field.max
    if (raw === undefined || raw.trim() === '' || !Number.isFinite(Number(raw))) return null
    const step = field.step && field.step !== 'any' ? Number(field.step) : 1
    const value =
      Number(raw) +
      (outside ? (lower ? -1 : 1) * (step > 0 && Number.isFinite(step) ? step : 1) : 0)
    return Number.isFinite(value) ? String(Number(value.toFixed(10))) : null
  }
  if (field.inputType === 'date') {
    const raw = lower ? field.min : field.max
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const time = Date.parse(raw) + (outside ? (lower ? -1 : 1) * 86400000 : 0)
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null
  }
  const length = lower ? field.minLength : field.maxLength
  if (length === undefined) return null
  const size = length + (outside ? (lower ? -1 : 1) : 0)
  return size >= 0 && size <= 4096 ? 'x'.repeat(size) : null
}
