import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '@quikfill/schemas'
import { buttonDiameter, isFieldAllowed, isHostBlocked, shouldShowOverlay } from './overlay-gate'

const base = (overrides: Partial<ExtensionSettings> = {}): ExtensionSettings => ({
  ...DEFAULT_EXTENSION_SETTINGS,
  ...overrides,
})

describe('shouldShowOverlay', () => {
  it('shows on a normal site with default settings', () => {
    expect(shouldShowOverlay(base(), 'example.com', false)).toBe(true)
  })
  it('hides when over the AI budget', () => {
    expect(shouldShowOverlay(base(), 'example.com', true)).toBe(false)
  })
  it('hides when globally disabled', () => {
    expect(shouldShowOverlay(base({ globalEnabled: false }), 'example.com', false)).toBe(false)
  })
  it('hides when the button is turned off', () => {
    expect(shouldShowOverlay(base({ showFillButton: false }), 'example.com', false)).toBe(false)
  })
  it('hides on a blocked host', () => {
    expect(
      shouldShowOverlay(base({ blockedHostnames: ['bank.example'] }), 'bank.example', false),
    ).toBe(false)
  })
})

describe('isHostBlocked', () => {
  it('matches exactly', () => {
    expect(isHostBlocked(['bank.example'], 'bank.example')).toBe(true)
  })
  it('matches subdomains', () => {
    expect(isHostBlocked(['bank.example'], 'login.bank.example')).toBe(true)
  })
  it('is www-insensitive on both sides', () => {
    expect(isHostBlocked(['www.bank.example'], 'bank.example')).toBe(true)
    expect(isHostBlocked(['bank.example'], 'www.bank.example')).toBe(true)
  })
  it('does not match an unrelated host or a superstring', () => {
    expect(isHostBlocked(['bank.example'], 'notbank.example')).toBe(false)
    expect(isHostBlocked(['bank.example'], 'example.com')).toBe(false)
  })
  it('ignores blank entries', () => {
    expect(isHostBlocked(['', '  '], 'example.com')).toBe(false)
  })
})

describe('isFieldAllowed', () => {
  it('never allows passwords or one-time codes', () => {
    expect(isFieldAllowed(base({ fillPaymentFields: true }), 'password', false)).toBe(false)
    expect(isFieldAllowed(base(), 'otp', false)).toBe(false)
  })
  it('gates payment fields on the opt-in', () => {
    expect(isFieldAllowed(base({ fillPaymentFields: false }), 'payment', false)).toBe(false)
    expect(isFieldAllowed(base({ fillPaymentFields: true }), 'payment', false)).toBe(true)
  })
  it('gates government-ID fields on the opt-in', () => {
    expect(isFieldAllowed(base({ fillGovernmentIdFields: false }), 'governmentId', false)).toBe(
      false,
    )
    expect(isFieldAllowed(base({ fillGovernmentIdFields: true }), 'governmentId', false)).toBe(true)
  })
  it('skips already-filled fields only when asked', () => {
    expect(isFieldAllowed(base({ skipFilledFields: true }), null, true)).toBe(false)
    expect(isFieldAllowed(base({ skipFilledFields: true }), null, false)).toBe(true)
    expect(isFieldAllowed(base({ skipFilledFields: false }), null, true)).toBe(true)
  })
  it('allows an ordinary empty field', () => {
    expect(isFieldAllowed(base(), null, false)).toBe(true)
  })
})

describe('buttonDiameter', () => {
  it('maps each size to a diameter', () => {
    expect(buttonDiameter('sm')).toBe(40)
    expect(buttonDiameter('md')).toBe(46)
    expect(buttonDiameter('lg')).toBe(54)
  })
})
