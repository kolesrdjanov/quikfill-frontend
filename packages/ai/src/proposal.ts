import { defaultFillStrategy, generatorRuleForSemanticType } from '@quikfill/autofill-core'
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
 * Convert an accepted AiSuggestion into a fill proposal. When the semantic type
 * maps to a generator we propose a deterministic `generatorRule` source; for
 * everything else we fall back to an advisory `aiGenerated` hint.
 */
export function suggestionToProposal(
  suggestion: AiSuggestion,
  field: DetectedField,
): SuggestionProposal {
  const generatorRule = generatorRuleForSemanticType(suggestion.semanticType)
  const fillSource: FillSource = generatorRule
    ? { sourceType: 'generatorRule', ruleKey: suggestion.semanticType }
    : { sourceType: 'aiGenerated', hint: suggestion.semanticType }

  return {
    fieldId: suggestion.fieldId,
    semanticType: suggestion.semanticType,
    confidence: suggestion.confidence,
    fillSource,
    fillStrategy: defaultFillStrategy(field),
    generatorRule,
  }
}
