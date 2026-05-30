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
  /** Present when the proposal resolves to a known generator; null otherwise. */
  generatorRule: GeneratorRule | null
}

export interface ProposalOptions {
  /**
   * Whether to fall back to a deterministic value *generator* (synthetic
   * "sample" data) when the user has no saved record for the field. Default
   * `false`: Quikfill is a real-info filler, so by default an accepted
   * suggestion either fills the user's own saved data or leaves an advisory
   * placeholder — it never silently writes fake data. Enable per the
   * `defaultFillSource` preference (opt-in sample data).
   */
  allowSampleData?: boolean
}

/**
 * Convert an accepted AiSuggestion into a fill proposal. Preference order:
 * the user's own saved data (`recordField`, when `recordMatch` is supplied)
 * always wins. Otherwise — only when sample data is explicitly allowed — a
 * deterministic `generatorRule` produces clearly-labeled sample data. With
 * neither, an advisory `aiGenerated` placeholder is left so the field is flagged
 * for the user to supply a value (or save one), never filled with fake data.
 */
export function suggestionToProposal(
  suggestion: AiSuggestion,
  field: DetectedField,
  recordMatch?: RecordMatch | null,
  options: ProposalOptions = {},
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

  const generatorRule = options.allowSampleData
    ? generatorRuleForSemanticType(suggestion.semanticType)
    : null
  const fillSource: FillSource = generatorRule
    ? { sourceType: 'generatorRule', ruleKey: suggestion.semanticType }
    : { sourceType: 'aiGenerated', hint: suggestion.semanticType }

  return { ...base, fillSource, generatorRule }
}
