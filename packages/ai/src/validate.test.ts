import { describe, expect, it } from 'vitest'
import { validateAiSuggestions } from './validate'

describe('validateAiSuggestions', () => {
  it('parses valid suggestions and defaults missing reasons', () => {
    const result = validateAiSuggestions([
      { fieldId: 'a', semanticType: 'email', confidence: 0.9, reasons: ['label match'] },
      { fieldId: 'b', semanticType: 'phone', confidence: 0.7 },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].reasons).toEqual(['label match'])
    expect(result[1].reasons).toEqual([])
  })

  it('drops genuinely malformed entries (bad fieldId / confidence / non-object)', () => {
    const result = validateAiSuggestions([
      { fieldId: 'a', semanticType: 'email', confidence: 0.9 },
      { fieldId: 'c', semanticType: 'phone', confidence: 2 }, // confidence out of range
      { semanticType: 'name', confidence: 0.5 }, // missing fieldId
      'nonsense',
    ])
    expect(result).toHaveLength(1)
    expect(result[0].fieldId).toBe('a')
  })

  it('coerces a missing or off-vocabulary semanticType to "unknown" rather than dropping the entry', () => {
    const result = validateAiSuggestions([
      { fieldId: 'b', confidence: 0.5 }, // missing semanticType → unknown
      { fieldId: 'd', semanticType: 'made.up', confidence: 0.8 }, // off-vocab → unknown
      { fieldId: 'e', semanticType: 'givenName', confidence: 0.8 }, // alias → person.firstName
    ])
    expect(result.map((s) => [s.fieldId, s.semanticType])).toEqual([
      ['b', 'unknown'],
      ['d', 'unknown'],
      ['e', 'person.firstName'],
    ])
  })

  it('returns an empty array for non-array input', () => {
    expect(validateAiSuggestions(null)).toEqual([])
    expect(validateAiSuggestions({ fieldId: 'a' })).toEqual([])
    expect(validateAiSuggestions(undefined)).toEqual([])
  })
})
