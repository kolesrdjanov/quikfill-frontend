import type {
  DetectedField,
  FillPlan,
  FillPlanItem,
  FillSource,
  FillStrategy,
  GeneratorRule,
} from '@quikfill/schemas'
import { classifyFields } from './classify'
import { resolveFillSource, type ResolveContext } from './resolve'

/** A field paired with the source chosen to fill it. */
export interface PlanAssignment {
  field: DetectedField
  fillSource: FillSource
  fillStrategy?: FillStrategy
  confidence?: number
}

/** Default DOM fill strategy for a field, inferred from its type. */
export function defaultFillStrategy(field: DetectedField): FillStrategy {
  const type = field.inputType.toLowerCase()
  if (type === 'select' || field.tagName === 'select') return 'select'
  if (type === 'checkbox' || type === 'radio') return 'clickToggle'
  return 'nativeInput'
}

/** Build a previewable FillPlan from explicit assignments. Never writes the page. */
export function buildFillPlan(assignments: PlanAssignment[], ctx: ResolveContext = {}): FillPlan {
  const items: FillPlanItem[] = assignments.map((a) => buildItem(a, ctx))
  return { items, mode: 'preview' }
}

function buildItem(assignment: PlanAssignment, ctx: ResolveContext): FillPlanItem {
  const { field, fillSource } = assignment
  const fieldOptions = field.options?.map((o) => o.value)
  const resolved = resolveFillSource(fillSource, { ...ctx, fieldOptions })

  const warnings = [...resolved.warnings]
  let requiresConfirmation = resolved.requiresConfirmation
  if (field.disabled) {
    warnings.push('Field is disabled — it will be skipped.')
    requiresConfirmation = true
  }
  if (field.readonly) {
    warnings.push('Field is read-only — it will be skipped.')
    requiresConfirmation = true
  }
  if (!field.visible) warnings.push('Field is not visible.')

  return {
    detectedFieldId: field.id,
    label: field.labelText || field.name || field.domId || field.id,
    currentValue: field.currentValue ?? null,
    proposedValue: resolved.value ?? '',
    fillSource,
    fillStrategy: assignment.fillStrategy ?? defaultFillStrategy(field),
    confidence: assignment.confidence ?? 0.5,
    warnings,
    requiresConfirmation,
  }
}

export interface PreviewOptions {
  seed?: string | number
  locale?: string
}

/**
 * High-level Iteration-4 entry: classify fields, assign a default generator
 * source per field, and resolve a preview plan. Fields we can't classify get an
 * empty static source flagged for the user to choose.
 */
export function buildPreviewPlan(fields: DetectedField[], opts: PreviewOptions = {}): FillPlan {
  const classifications = classifyFields(fields)
  const byId = new Map(classifications.map((c) => [c.fieldId, c]))
  const rules: Record<string, GeneratorRule> = {}
  const assignments: PlanAssignment[] = []

  for (const field of fields) {
    const c = byId.get(field.id)
    if (c?.suggestedKind) {
      rules[field.id] = { fieldKey: field.id, kind: c.suggestedKind, options: c.generatorOptions }
      assignments.push({
        field,
        fillSource: { sourceType: 'generatorRule', ruleKey: field.id },
        confidence: c.confidence,
      })
    } else {
      assignments.push({
        field,
        fillSource: { sourceType: 'staticValue', value: '' },
        confidence: c?.confidence ?? 0.2,
      })
    }
  }

  return buildFillPlan(assignments, { seed: opts.seed, locale: opts.locale, rules })
}
