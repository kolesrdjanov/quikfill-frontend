import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { classifyField } from './classify'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

/** Classify from a label only (the signal a layer name / bare field label carries). */
const typeOf = (label: string): string =>
  classifyField(field({ id: label, labelText: label })).semanticType

describe('classifyField — keyword precision (word boundaries)', () => {
  it('still classifies legitimate count/number fields as number', () => {
    expect(typeOf('Count')).toBe('number')
    expect(typeOf('Item count')).toBe('number')
    expect(typeOf('Number of guests')).toBe('number')
    expect(typeOf('Quantity')).toBe('number')
    expect(typeOf('Account number')).toBe('number')
  })

  it('does not classify words that merely contain "count" as number', () => {
    expect(typeOf('County')).not.toBe('number')
    expect(typeOf('Discount')).not.toBe('number')
  })

  it('still classifies legitimate date fields as date', () => {
    expect(typeOf('Date')).toBe('date')
    expect(typeOf('Start date')).toBe('date')
    expect(typeOf('Date of birth')).toBe('date')
    expect(typeOf('Birthday')).toBe('date')
    expect(typeOf('DOB')).toBe('date')
  })

  it('does not classify words that merely contain "date" as date', () => {
    expect(typeOf('Validate')).not.toBe('date')
    expect(typeOf('Candidate')).not.toBe('date')
  })

  it('treats "Created" and "Updated" consistently (neither is a date by substring)', () => {
    expect(typeOf('Created')).toBe(typeOf('Updated'))
    expect(typeOf('Updated')).toBe('unknown')
    expect(typeOf('Created')).toBe('unknown')
  })
})
