import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '@quikfill/schemas'
import {
  activeHostList,
  buttonDiameter,
  isHostActive,
  isHostBlocked,
  removeActiveHost,
  setHostEnabled,
  shouldShowOverlay,
} from './overlay-gate'

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
  it('allowlist mode: shows only on allowed hosts', () => {
    const s = base({ activationMode: 'allowlist', allowedHostnames: ['app.quikstor.com'] })
    expect(shouldShowOverlay(s, 'app.quikstor.com', false)).toBe(true)
    expect(shouldShowOverlay(s, 'example.com', false)).toBe(false)
  })
  it('allowlist mode with an empty list shows nowhere', () => {
    expect(shouldShowOverlay(base({ activationMode: 'allowlist' }), 'example.com', false)).toBe(
      false,
    )
  })
})

describe('isHostActive', () => {
  it('all mode: active unless blocked', () => {
    const s = base({ blockedHostnames: ['bank.example'] })
    expect(isHostActive(s, 'example.com')).toBe(true)
    expect(isHostActive(s, 'bank.example')).toBe(false)
  })
  it('allowlist mode: active only when allowed', () => {
    const s = base({ activationMode: 'allowlist', allowedHostnames: ['app.quikstor.com'] })
    expect(isHostActive(s, 'app.quikstor.com')).toBe(true)
    expect(isHostActive(s, 'example.com')).toBe(false)
  })
})

describe('setHostEnabled / activeHostList / removeActiveHost', () => {
  it('all mode: disabling adds to the blocklist, enabling removes it', () => {
    const off = setHostEnabled(base(), 'bank.example', false)
    expect(off.blockedHostnames).toEqual(['bank.example'])
    expect(setHostEnabled(off, 'bank.example', true).blockedHostnames).toEqual([])
  })
  it('allowlist mode: enabling adds to the allowlist, disabling removes it', () => {
    const s = base({ activationMode: 'allowlist' })
    const on = setHostEnabled(s, 'app.quikstor.com', true)
    expect(on.allowedHostnames).toEqual(['app.quikstor.com'])
    expect(setHostEnabled(on, 'app.quikstor.com', false).allowedHostnames).toEqual([])
  })
  it('normalizes and de-dupes the stored host (www/URL forms)', () => {
    const off = setHostEnabled(
      base({ blockedHostnames: ['bank.example'] }),
      'www.bank.example',
      false,
    )
    expect(off.blockedHostnames).toEqual(['bank.example'])
  })
  it('leaves the non-active list untouched when toggling', () => {
    const s = base({ activationMode: 'allowlist', blockedHostnames: ['keep.example'] })
    expect(setHostEnabled(s, 'a.example', true).blockedHostnames).toEqual(['keep.example'])
  })
  it('activeHostList tracks the mode', () => {
    expect(activeHostList(base({ blockedHostnames: ['a.example'] }))).toEqual(['a.example'])
    expect(
      activeHostList(base({ activationMode: 'allowlist', allowedHostnames: ['b.example'] })),
    ).toEqual(['b.example'])
  })
  it('removeActiveHost drops the entry in either mode', () => {
    expect(
      removeActiveHost(base({ blockedHostnames: ['a.example'] }), 'a.example').blockedHostnames,
    ).toEqual([])
    const allow = base({ activationMode: 'allowlist', allowedHostnames: ['b.example'] })
    expect(removeActiveHost(allow, 'b.example').allowedHostnames).toEqual([])
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
