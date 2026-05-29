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

  it('drops invalid entries but keeps valid ones', () => {
    const result = validateAiSuggestions([
      { fieldId: 'a', semanticType: 'email', confidence: 0.9 },
      { fieldId: 'b', confidence: 0.5 }, // missing semanticType
      { fieldId: 'c', semanticType: 'phone', confidence: 2 }, // confidence out of range
      { semanticType: 'name', confidence: 0.5 }, // missing fieldId
      'nonsense',
    ])
    expect(result).toHaveLength(1)
    expect(result[0].fieldId).toBe('a')
  })

  it('returns an empty array for non-array input', () => {
    expect(validateAiSuggestions(null)).toEqual([])
    expect(validateAiSuggestions({ fieldId: 'a' })).toEqual([])
    expect(validateAiSuggestions(undefined)).toEqual([])
  })
})
