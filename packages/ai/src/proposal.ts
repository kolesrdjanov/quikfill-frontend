import {
  defaultFillStrategy,
  generatorRuleForSemanticType,
  type RecordMatch,
} from '@quikfill/autofill-core'
import type {
  AiSuggestion,
  DetectedField,
  FillSource,
  FillStrategy,
  GeneratorRule,
} from '@quikfill/schemas'

/**
 * An accepted AI suggestion turned into a reviewable fill proposal. It is never
 * applied automatically — the user reviews it and the panel uses it to override a
 * single plan item.
 */
export interface SuggestionProposal {
  fieldId: string
  semanticType: string
  confidence: number
  fillSource: FillSource
  fillStrategy: FillStrategy
  /** Present when the semantic type maps to a known generator; null otherwise. */
  generatorRule: GeneratorRule | null
}

/**
 * Convert an accepted AiSuggestion into a fill proposal. Preference order:
 * the user's own saved data (`recordField`, when `recordMatch` is supplied) wins,
 * then a deterministic `generatorRule` when the semantic type maps to one, and
 * finally an advisory `aiGenerated` hint when nothing can produce a value.
 */
export function suggestionToProposal(
  suggestion: AiSuggestion,
  field: DetectedField,
  recordMatch?: RecordMatch | null,
): SuggestionProposal {
  const base = {
    fieldId: suggestion.fieldId,
    semanticType: suggestion.semanticType,
    confidence: suggestion.confidence,
    fillStrategy: defaultFillStrategy(field),
  }

  if (recordMatch) {
    return {
      ...base,
      fillSource: {
        sourceType: 'recordField',
        entityTypeId: recordMatch.entityTypeId,
        recordId: recordMatch.recordId,
        fieldKey: recordMatch.fieldKey,
      },
      generatorRule: null,
    }
  }

  const generatorRule = generatorRuleForSemanticType(suggestion.semanticType)
  const fillSource: FillSource = generatorRule
    ? { sourceType: 'generatorRule', ruleKey: suggestion.semanticType }
    : { sourceType: 'aiGenerated', hint: suggestion.semanticType }

  return { ...base, fillSource, generatorRule }
}
