import { describe, expect, it } from 'vitest'
import {
  detectedFieldSchema,
  fieldMappingSchema,
  type DetectedField,
  type FieldMapping,
} from '@quikfill/schemas'
import { indexMatchedMappings, matchMappings, scoreMapping } from './mapping-match'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

function mapping(partial: Partial<FieldMapping>): FieldMapping {
  return fieldMappingSchema.parse({
    id: crypto.randomUUID(),
    formProfileId: '22222222-2222-4222-8222-222222222222',
    fieldFingerprint: 'fp',
    target: { fieldFingerprint: 'fp' },
    fillSource: { sourceType: 'staticValue', value: 'x' },
    fillStrategy: 'nativeInput',
    ...partial,
  })
}

describe('scoreMapping', () => {
  it('scores an exact fingerprint match as 1', () => {
    expect(
      scoreMapping(field({ id: 'a', domFingerprint: 'fp1' }), mapping({ fieldFingerprint: 'fp1' })),
    ).toBe(1)
  })

  it('falls back to selector overlap', () => {
    const f = field({ id: 'a', domFingerprint: 'x', selectorCandidates: ['#email'] })
    const m = mapping({ fieldFingerprint: 'y', selectorCandidates: ['#email'] })
    expect(scoreMapping(f, m)).toBeCloseTo(0.6)
  })

  it('scores zero when nothing matches', () => {
    expect(
      scoreMapping(field({ id: 'a', domFingerprint: 'x' }), mapping({ fieldFingerprint: 'y' })),
    ).toBe(0)
  })
})

describe('matchMappings', () => {
  it('matches fields to mappings by fingerprint, one-to-one', () => {
    const fields = [
      field({ id: 'f1', domFingerprint: 'a' }),
      field({ id: 'f2', domFingerprint: 'b' }),
    ]
    const m1 = mapping({ fieldFingerprint: 'a' })
    const m2 = mapping({ fieldFingerprint: 'b' })
    const result = matchMappings(fields, [m1, m2])
    expect(result.get('f1')!.mapping.id).toBe(m1.id)
    expect(result.get('f2')!.mapping.id).toBe(m2.id)
  })

  it('leaves unmatched fields out', () => {
    const result = matchMappings(
      [field({ id: 'f1', domFingerprint: 'a' })],
      [mapping({ fieldFingerprint: 'zzz' })],
    )
    expect(result.has('f1')).toBe(false)
  })
})

describe('indexMatchedMappings', () => {
  it('keys a mapping under the field CURRENT fingerprint (exact match)', () => {
    const f = field({ id: 'f1', domFingerprint: 'fpA' })
    const m = mapping({ fieldFingerprint: 'fpA' })
    const indexed = indexMatchedMappings(matchMappings([f], [m]))
    expect(indexed.get('fpA')?.id).toBe(m.id)
  })

  it('keys a DRIFTED mapping (recovered by selector overlap) under the field current fingerprint, not its stale stored one', () => {
    // The mapping's stored fingerprint drifted to 'OLD'; the field now hashes to
    // 'NEW'. matchMappings still recovers it via selector overlap (0.6). The plan
    // looks up savedMappings by the field's CURRENT domFingerprint, so that key
    // — not the stale 'OLD' — must hold the mapping, else it is silently dropped.
    const f = field({ id: 'f1', domFingerprint: 'NEW', selectorCandidates: ['#x'] })
    const m = mapping({ fieldFingerprint: 'OLD', selectorCandidates: ['#x'] })
    const indexed = indexMatchedMappings(matchMappings([f], [m]))
    expect(indexed.get('NEW')?.id).toBe(m.id)
    expect(indexed.has('OLD')).toBe(false)
  })
})
