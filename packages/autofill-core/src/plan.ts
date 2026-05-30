import type {
  DetectedField,
  FieldMapping,
  FillPlan,
  FillPlanItem,
  FillSource,
  FillStrategy,
  GeneratorRule,
} from '@quikfill/schemas'
import { classifyFields, generatorRuleForSemanticType } from './classify'
import { resolveFillSource, type ResolveContext } from './resolve'
import { defaultSourceFor } from './source-policy'
import { recordMatchForSemanticType, type RecordIndex } from './record-index'

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
  if (field.autocompleteHint) return 'assistedAutocomplete'
  if (type === 'customselect' || field.customWidget) return 'customSelect'
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
  // salt by field id so two same-kind fields get distinct generated values.
  const resolved = resolveFillSource(fillSource, { ...ctx, fieldOptions, salt: field.id })

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
  /** Saved mappings to apply first, keyed by field fingerprint (`domFingerprint`). */
  savedMappings?: Map<string, FieldMapping>
  /** Saved entity-record values (recordId → values) for `recordField` sources. */
  records?: Record<string, Record<string, unknown>>
  /** Whether the active preference permits synthetic sample data (default false). */
  allowSampleData?: boolean
  /** Saved-record index, so the default can prefer a real saved value. */
  recordIndex?: RecordIndex
}

/**
 * High-level entry: apply any saved mapping first (matched by fingerprint),
 * otherwise classify the field and assign a default generator source, then
 * resolve a preview plan. Never writes the page.
 */
export function buildPreviewPlan(fields: DetectedField[], opts: PreviewOptions = {}): FillPlan {
  const byId = new Map(classifyFields(fields).map((c) => [c.fieldId, c]))
  const rules: Record<string, GeneratorRule> = {}
  const assignments: PlanAssignment[] = []

  for (const field of fields) {
    const saved = opts.savedMappings?.get(field.domFingerprint)
    if (saved) {
      if (saved.fillSource.sourceType === 'generatorRule') {
        const rule = generatorRuleForSemanticType(saved.fillSource.ruleKey)
        if (rule) rules[saved.fillSource.ruleKey] = rule
      }
      assignments.push({
        field,
        fillSource: saved.fillSource,
        fillStrategy: saved.fillStrategy,
        confidence: saved.confidence,
      })
      continue
    }

    const c = byId.get(field.id)
    const semanticType = c?.semanticType ?? 'unknown'
    const generatorRule = c?.suggestedKind
      ? { fieldKey: semanticType, kind: c.suggestedKind, options: c.generatorOptions }
      : null
    const recordMatch = opts.recordIndex
      ? recordMatchForSemanticType(opts.recordIndex, semanticType)
      : null
    const { fillSource, rule } = defaultSourceFor({
      semanticType,
      allowSampleData: opts.allowSampleData ?? false,
      recordMatch,
      generatorRule,
    })
    if (rule) rules[semanticType] = rule
    assignments.push({ field, fillSource, confidence: c?.confidence ?? 0.2 })
  }

  return buildFillPlan(assignments, {
    seed: opts.seed,
    locale: opts.locale,
    rules,
    records: opts.records,
  })
}
