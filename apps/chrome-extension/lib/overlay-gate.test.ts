import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '@quikfill/schemas'
import { buttonDiameter, isHostBlocked, shouldShowOverlay } from './overlay-gate'

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
  it('matches an entry pasted as a full URL (scheme/path/query)', () => {
    expect(isHostBlocked(['https://app.quikfill.io'], 'app.quikfill.io')).toBe(true)
    expect(isHostBlocked(['https://bank.example/login?x=1'], 'login.bank.example')).toBe(true)
  })
  it('matches an entry carrying a port or trailing slash', () => {
    expect(isHostBlocked(['bank.example:8080/'], 'bank.example')).toBe(true)
  })
  it('normalizes a hostname argument that arrives as a URL too', () => {
    expect(isHostBlocked(['bank.example'], 'https://bank.example/')).toBe(true)
  })
})

describe('buttonDiameter', () => {
  it('maps each size to a diameter', () => {
    expect(buttonDiameter('sm')).toBe(40)
    expect(buttonDiameter('md')).toBe(46)
    expect(buttonDiameter('lg')).toBe(54)
  })
})
