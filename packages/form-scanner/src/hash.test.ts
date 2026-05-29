import { describe, expect, it } from 'vitest'
import { fnv1aHex } from './hash'

describe('fnv1aHex', () => {
  it('is deterministic', () => {
    expect(fnv1aHex('hello')).toBe(fnv1aHex('hello'))
  })

  it('differs for different inputs', () => {
    expect(fnv1aHex('a')).not.toBe(fnv1aHex('b'))
  })

  it('returns 8 hex chars', () => {
    expect(fnv1aHex('anything')).toMatch(/^[0-9a-f]{8}$/)
  })
})
