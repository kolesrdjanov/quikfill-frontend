import { describe, expect, it } from 'vitest'
import { aiSuggestionSchema, normalizeSemanticType, SEMANTIC_TYPES } from './ai'

describe('normalizeSemanticType', () => {
  it('keeps a canonical vocabulary value', () => {
    expect(normalizeSemanticType('person.firstName')).toBe('person.firstName')
    expect(normalizeSemanticType('address.zip')).toBe('address.zip')
  })

  it('maps common model-drift aliases to the canonical vocabulary', () => {
    expect(normalizeSemanticType('firstName')).toBe('person.firstName')
    expect(normalizeSemanticType('postal-code')).toBe('address.zip')
    expect(normalizeSemanticType('tel')).toBe('phone')
    expect(normalizeSemanticType('Person.FirstName')).toBe('person.firstName')
  })

  it('coerces anything off-vocabulary (or non-string) to "unknown"', () => {
    expect(normalizeSemanticType('astrological.sign')).toBe('unknown')
    expect(normalizeSemanticType('')).toBe('unknown')
    expect(normalizeSemanticType(42)).toBe('unknown')
  })
})

describe('aiSuggestionSchema', () => {
  it('coerces an off-vocabulary semanticType to "unknown" instead of rejecting the suggestion', () => {
    const parsed = aiSuggestionSchema.parse({
      fieldId: 'f1',
      semanticType: 'made.up',
      confidence: 0.9,
    })
    expect(parsed.semanticType).toBe('unknown')
    expect(parsed.reasons).toEqual([])
  })

  it('normalizes an aliased semanticType', () => {
    const parsed = aiSuggestionSchema.parse({
      fieldId: 'f1',
      semanticType: 'givenName',
      confidence: 0.9,
    })
    expect(parsed.semanticType).toBe('person.firstName')
  })

  it('still rejects an out-of-range confidence', () => {
    expect(
      aiSuggestionSchema.safeParse({ fieldId: 'f1', semanticType: 'email', confidence: 2 }).success,
    ).toBe(false)
  })

  it('exposes the closed vocabulary including the unknown fallback', () => {
    expect(SEMANTIC_TYPES).toContain('email')
    expect(SEMANTIC_TYPES).toContain('unknown')
  })
})
