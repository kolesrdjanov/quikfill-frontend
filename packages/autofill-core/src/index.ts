export {
  classifyField,
  classifyFields,
  generatorRuleForSemanticType,
  type FieldClassification,
} from './classify'
export { resolveFillSource, type ResolveContext, type ResolvedValue } from './resolve'
export {
  buildFillPlan,
  buildPreviewPlan,
  defaultFillStrategy,
  type PlanAssignment,
  type PreviewOptions,
} from './plan'
export {
  matchProfiles,
  globToRegExp,
  type ProfileMatchContext,
  type MatchableProfile,
} from './profile-match'
export {
  indexMatchedMappings,
  matchMappings,
  scoreMapping,
  type MappingMatch,
} from './mapping-match'
export {
  buildRecordIndex,
  recordMatchForSemanticType,
  recordValuesById,
  semanticTypeForEntityField,
  type RecordIndex,
  type RecordMatch,
} from './record-index'
export {
  defaultSourceFor,
  isSensitiveSemanticType,
  SENSITIVE_SEMANTIC_TYPES,
  type SourcePolicyInput,
} from './source-policy'
export { classifySensitive, type SensitiveCategory } from './sensitive'
