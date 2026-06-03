import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { classifySensitive } from './sensitive'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

describe('classifySensitive', () => {
  it('detects passwords by input type', () => {
    expect(classifySensitive(field({ id: 'p1', inputType: 'password' }))).toBe('password')
  })
  it('detects passwords by autocomplete token', () => {
    expect(classifySensitive(field({ id: 'p2', autocomplete: 'current-password' }))).toBe(
      'password',
    )
    expect(classifySensitive(field({ id: 'p3', autocomplete: 'new-password' }))).toBe('password')
  })
  it('detects passwords by label keyword', () => {
    expect(classifySensitive(field({ id: 'p4', labelText: 'Password' }))).toBe('password')
  })

  it('detects payment fields by cc-* autocomplete', () => {
    expect(classifySensitive(field({ id: 'c1', autocomplete: 'cc-number' }))).toBe('payment')
    expect(classifySensitive(field({ id: 'c2', autocomplete: 'cc-csc' }))).toBe('payment')
    expect(classifySensitive(field({ id: 'c3', autocomplete: 'cc-name' }))).toBe('payment')
  })
  it('detects payment fields by label keyword', () => {
    expect(classifySensitive(field({ id: 'c4', labelText: 'Card number' }))).toBe('payment')
    expect(classifySensitive(field({ id: 'c5', labelText: 'CVV' }))).toBe('payment')
  })
  it('does not mistake a card security code for an OTP (cc-csc wins)', () => {
    expect(
      classifySensitive(field({ id: 'c6', autocomplete: 'cc-csc', labelText: 'Security code' })),
    ).toBe('payment')
  })

  it('detects OTP fields by one-time-code autocomplete', () => {
    expect(classifySensitive(field({ id: 'o1', autocomplete: 'one-time-code' }))).toBe('otp')
  })
  it('detects OTP fields by label keyword', () => {
    expect(classifySensitive(field({ id: 'o2', labelText: 'Verification code' }))).toBe('otp')
    expect(classifySensitive(field({ id: 'o3', labelText: 'Enter your 2FA code' }))).toBe('otp')
  })

  it('detects government IDs', () => {
    expect(classifySensitive(field({ id: 'g1', labelText: 'SSN' }))).toBe('governmentId')
    expect(classifySensitive(field({ id: 'g2', labelText: 'Social Security Number' }))).toBe(
      'governmentId',
    )
    expect(classifySensitive(field({ id: 'g3', labelText: 'Passport number' }))).toBe(
      'governmentId',
    )
  })

  it('returns null for ordinary fields', () => {
    expect(
      classifySensitive(field({ id: 'n1', inputType: 'email', labelText: 'Email' })),
    ).toBeNull()
    expect(classifySensitive(field({ id: 'n2', labelText: 'First name' }))).toBeNull()
    expect(classifySensitive(field({ id: 'n3', labelText: 'Street address' }))).toBeNull()
  })
})
