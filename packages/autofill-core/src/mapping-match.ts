import type { DetectedField, FieldMapping } from '@quikfill/schemas'

export interface MappingMatch {
  field: DetectedField
  mapping: FieldMapping
  /** 0–1 confidence that this mapping applies to this field. */
  score: number
}

/**
 * Score how well a saved mapping fits a detected field. Exact fingerprint is the
 * strong signal; overlapping selector candidates provide a weaker fallback.
 */
export function scoreMapping(field: DetectedField, mapping: FieldMapping): number {
  if (mapping.fieldFingerprint && mapping.fieldFingerprint === field.domFingerprint) return 1
  const overlap = mapping.selectorCandidates.some((s) => field.selectorCandidates.includes(s))
  return overlap ? 0.6 : 0
}

/**
 * Match detected fields to saved mappings, preferring fingerprint matches. Each
 * field and each mapping is used at most once (best score wins).
 */
export function matchMappings(
  fields: DetectedField[],
  mappings: FieldMapping[],
): Map<string, MappingMatch> {
  const result = new Map<string, MappingMatch>()
  const usedMappings = new Set<string>()

  // Highest-scoring pairs first so exact fingerprint matches win contention.
  const pairs: MappingMatch[] = []
  for (const field of fields) {
    for (const mapping of mappings) {
      const score = scoreMapping(field, mapping)
      if (score > 0) pairs.push({ field, mapping, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  for (const pair of pairs) {
    if (result.has(pair.field.id) || usedMappings.has(pair.mapping.id)) continue
    result.set(pair.field.id, pair)
    usedMappings.add(pair.mapping.id)
  }
  return result
}

/**
 * Index matched mappings by the matched field's CURRENT `domFingerprint`, the key
 * `buildPreviewPlan` looks them up by. This is load-bearing for drift recovery:
 * a mapping recovered via selector overlap carries a *stale* stored fingerprint,
 * so keying by `mapping.fieldFingerprint` would file it under a key the plan never
 * queries — silently dropping it. Keying by the field's live fingerprint makes the
 * recovered mapping actually apply.
 */
export function indexMatchedMappings(
  matched: Map<string, MappingMatch>,
): Map<string, FieldMapping> {
  const byFingerprint = new Map<string, FieldMapping>()
  for (const match of matched.values()) {
    byFingerprint.set(match.field.domFingerprint, match.mapping)
  }
  return byFingerprint
}
