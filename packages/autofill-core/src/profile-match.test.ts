import { describe, expect, it } from 'vitest'
import { formProfileSchema, type FormProfile } from '@quikfill/schemas'
import { globToRegExp, matchProfiles, type MatchableProfile } from './profile-match'

let n = 0
function profile(partial: Partial<FormProfile>): FormProfile {
  n += 1
  return formProfileSchema.parse({
    id: crypto.randomUUID(),
    domainId: '22222222-2222-4222-8222-222222222222',
    name: `p${n}`,
    ...partial,
  })
}

function matchable(p: FormProfile, hostnames = ['acme.com']): MatchableProfile {
  return { profile: p, hostnames }
}

describe('globToRegExp', () => {
  it('matches with * and ?', () => {
    expect(globToRegExp('https://acme.com/*').test('https://acme.com/signup')).toBe(true)
    expect(globToRegExp('a?c').test('abc')).toBe(true)
    expect(globToRegExp('https://acme.com/x').test('https://other.com/x')).toBe(false)
  })
})

describe('matchProfiles', () => {
  it('excludes profiles failing the hostname gate', () => {
    const p = profile({ urlPatterns: ['https://acme.com/*'] })
    const out = matchProfiles([matchable(p, ['other.com'])], {
      hostname: 'acme.com',
      url: 'https://acme.com/signup',
    })
    expect(out).toHaveLength(0)
  })

  it('ranks an exact-fingerprint match above a url-only match', () => {
    const fpProfile = profile({ fieldFingerprintHash: 'abc123', urlPatterns: [] })
    const urlProfile = profile({ urlPatterns: ['https://acme.com/*'] })
    const out = matchProfiles([matchable(urlProfile), matchable(fpProfile)], {
      hostname: 'acme.com',
      url: 'https://acme.com/signup',
      fieldFingerprintHash: 'abc123',
    })
    expect(out[0].formProfileId).toBe(fpProfile.id)
    expect(out[0].reasons).toContain('fingerprint')
  })

  it('scores url, title, fingerprint, structure, and field count', () => {
    const p = profile({
      urlPatterns: ['https://acme.com/*'],
      pageTitlePatterns: ['Sign*'],
      fieldFingerprintHash: 'fp',
      structureMetadata: { fieldCount: 4, structureHash: 'sh' },
    })
    const out = matchProfiles([matchable(p)], {
      hostname: 'acme.com',
      url: 'https://acme.com/signup',
      pageTitle: 'Sign up',
      fieldFingerprintHash: 'fp',
      structureHash: 'sh',
      fieldCount: 4,
    })
    expect(out[0].reasons).toEqual(
      expect.arrayContaining(['urlPattern', 'pageTitle', 'fingerprint', 'structure', 'fieldCount']),
    )
  })

  it('returns nothing when no signal matches', () => {
    const p = profile({ urlPatterns: ['https://acme.com/login'] })
    const out = matchProfiles([matchable(p)], {
      hostname: 'acme.com',
      url: 'https://acme.com/other',
    })
    expect(out).toHaveLength(0)
  })
})
