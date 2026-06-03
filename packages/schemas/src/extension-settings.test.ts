import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXTENSION_SETTINGS,
  extensionSettingsSchema,
  normalizeHostname,
} from './extension-settings'

describe('DEFAULT_EXTENSION_SETTINGS', () => {
  it('is enabled by default and parses against the schema', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.globalEnabled).toBe(true)
    expect(() => extensionSettingsSchema.parse(DEFAULT_EXTENSION_SETTINGS)).not.toThrow()
  })
})

describe('normalizeHostname', () => {
  it('strips the scheme', () => {
    expect(normalizeHostname('https://app.quikfill.io')).toBe('app.quikfill.io')
    expect(normalizeHostname('http://example.com')).toBe('example.com')
  })
  it('strips path, query, hash, port and userinfo', () => {
    expect(normalizeHostname('https://example.com:8443/login?x=1#y')).toBe('example.com')
    expect(normalizeHostname('https://user:pass@example.com/')).toBe('example.com')
  })
  it('strips a leading www. and lower-cases', () => {
    expect(normalizeHostname('WWW.Example.COM')).toBe('example.com')
    expect(normalizeHostname('https://www.bank.example/')).toBe('bank.example')
  })
  it('passes a bare hostname through unchanged', () => {
    expect(normalizeHostname('bank.example')).toBe('bank.example')
  })
  it('returns an empty string for blank input', () => {
    expect(normalizeHostname('   ')).toBe('')
    expect(normalizeHostname('')).toBe('')
  })
})
