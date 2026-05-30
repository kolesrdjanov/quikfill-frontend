import type { FillSource, GeneratorRule } from '@quikfill/schemas'
import type { RecordMatch } from './record-index'

/**
 * Semantic types we recognize but never fabricate a fake value for. They are
 * recognized (so a saved value fills, and the user can sample one on demand via
 * the source pill), but the default never proposes synthetic data for them.
 */
export const SENSITIVE_SEMANTIC_TYPES: ReadonlySet<string> = new Set(['ssn', 'taxId'])

export function isSensitiveSemanticType(semanticType: string): boolean {
  return SENSITIVE_SEMANTIC_TYPES.has(semanticType)
}

export interface SourcePolicyInput {
  semanticType: string
  /** Whether the active preference permits synthetic sample data. */
  allowSampleData: boolean
  /** A matched saved record for this semantic type, if any. */
  recordMatch?: RecordMatch | null
  /** The generator rule to use if sampling is chosen (may carry per-field options). */
  generatorRule: GeneratorRule | null
}

/**
 * The single place that decides a field's default fill source: saved data wins;
 * otherwise sample data only when allowed AND the type is not sensitive AND a
 * generator exists; otherwise an `aiGenerated` placeholder ("needs a value").
 */
export function defaultSourceFor(input: SourcePolicyInput): {
  fillSource: FillSource
  rule: GeneratorRule | null
} {
  const { semanticType, allowSampleData, recordMatch, generatorRule } = input
  if (recordMatch) {
    return {
      fillSource: {
        sourceType: 'recordField',
        entityTypeId: recordMatch.entityTypeId,
        recordId: recordMatch.recordId,
        fieldKey: recordMatch.fieldKey,
      },
      rule: null,
    }
  }
  if (allowSampleData && !isSensitiveSemanticType(semanticType) && generatorRule) {
    return {
      fillSource: { sourceType: 'generatorRule', ruleKey: generatorRule.fieldKey },
      rule: generatorRule,
    }
  }
  return { fillSource: { sourceType: 'aiGenerated', hint: semanticType }, rule: null }
}
