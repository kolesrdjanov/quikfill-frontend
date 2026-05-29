import { describe, expect, it } from 'vitest'
import { fingerprint } from './fingerprint'

describe('fingerprint', () => {
  it('is stable for the same identity inputs', () => {
    const a = fingerprint({ label: 'Email', name: 'email', type: 'email' })
    const b = fingerprint({ label: 'Email', name: 'email', type: 'email' })
    expect(a.hash).toBe(b.hash)
  })

  it('is independent of option order', () => {
    const a = fingerprint({ label: 'Role', type: 'select', options: ['admin', 'user'] })
    const b = fingerprint({ label: 'Role', type: 'select', options: ['user', 'admin'] })
    expect(a.hash).toBe(b.hash)
  })

  it('differs across distinct fields', () => {
    const a = fingerprint({ label: 'First name', name: 'first', type: 'text' })
    const b = fingerprint({ label: 'Last name', name: 'last', type: 'text' })
    expect(a.hash).not.toBe(b.hash)
  })

  it('is case-insensitive on labels', () => {
    const a = fingerprint({ label: 'Email' })
    const b = fingerprint({ label: 'email' })
    expect(a.hash).toBe(b.hash)
  })
})
