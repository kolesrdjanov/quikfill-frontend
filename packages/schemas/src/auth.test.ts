import { describe, expect, it } from 'vitest'
import { authErrorKind, handoffCodeSchema, redeemHandoffInputSchema } from './auth'

describe('authErrorKind', () => {
  it('maps 400 to invalid-code', () => {
    expect(authErrorKind(400)).toBe('invalid-code')
  })

  it('maps 401 to unauthorized', () => {
    expect(authErrorKind(401)).toBe('unauthorized')
  })

  it('maps 402 to payment-required', () => {
    expect(authErrorKind(402)).toBe('payment-required')
  })

  it('maps 429 to quota-exceeded', () => {
    expect(authErrorKind(429)).toBe('quota-exceeded')
  })

  it('maps 503 to unavailable', () => {
    expect(authErrorKind(503)).toBe('unavailable')
  })

  it('maps a missing status (transport failure) to network', () => {
    expect(authErrorKind(undefined)).toBe('network')
  })

  it('maps an unmapped status to unknown', () => {
    expect(authErrorKind(418)).toBe('unknown')
    expect(authErrorKind(500)).toBe('unknown')
  })
})

describe('handoffCodeSchema', () => {
  it('parses a code with its ttl', () => {
    expect(handoffCodeSchema.parse({ code: 'abc123', expiresIn: 60 })).toEqual({
      code: 'abc123',
      expiresIn: 60,
    })
  })

  it('rejects a response missing the code', () => {
    expect(() => handoffCodeSchema.parse({ expiresIn: 60 })).toThrow()
  })
})

describe('redeemHandoffInputSchema', () => {
  it('parses a non-empty code', () => {
    expect(redeemHandoffInputSchema.parse({ code: 'abc123' })).toEqual({ code: 'abc123' })
  })

  it('rejects an empty code', () => {
    expect(() => redeemHandoffInputSchema.parse({ code: '' })).toThrow()
  })
})
