import { describe, expect, it } from 'vitest'
import { inviteBetaUserInputSchema } from '@quikfill/schemas'
import { signInEmailSchema } from './forms'

describe('signInEmailSchema', () => {
  it('accepts any valid email — access is enforced by the backend beta gate, not the client', () => {
    expect(signInEmailSchema.safeParse({ email: 'anyone@example.com' }).success).toBe(true)
  })

  it('still rejects a malformed email', () => {
    expect(signInEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})

describe('inviteBetaUserInputSchema', () => {
  it('accepts a valid email', () => {
    expect(inviteBetaUserInputSchema.safeParse({ email: 'newtester@example.com' }).success).toBe(
      true,
    )
  })

  it('rejects a malformed email', () => {
    expect(inviteBetaUserInputSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
})
