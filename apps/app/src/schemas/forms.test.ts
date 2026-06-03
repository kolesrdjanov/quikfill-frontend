import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, inviteBetaUserInputSchema } from '@quikfill/schemas'
import { extensionSettingsFormSchema, listToLines, signInEmailSchema } from './forms'

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

describe('extensionSettingsFormSchema', () => {
  it('splits the blocked-hostnames textarea into a trimmed, non-empty list', () => {
    const parsed = extensionSettingsFormSchema.parse({
      ...DEFAULT_EXTENSION_SETTINGS,
      blockedHostnames: ' bank.example.com \n\n admin.work.example , dup.example \n',
    })
    expect(parsed.blockedHostnames).toEqual([
      'bank.example.com',
      'admin.work.example',
      'dup.example',
    ])
  })

  it('treats an empty textarea as no blocked sites', () => {
    const parsed = extensionSettingsFormSchema.parse({
      ...DEFAULT_EXTENSION_SETTINGS,
      blockedHostnames: '   \n  ',
    })
    expect(parsed.blockedHostnames).toEqual([])
  })

  it('round-trips a stored list back through listToLines for editing', () => {
    expect(listToLines(['a.example', 'b.example'])).toBe('a.example\nb.example')
  })

  it('rejects an invalid enum value', () => {
    expect(
      extensionSettingsFormSchema.safeParse({
        ...DEFAULT_EXTENSION_SETTINGS,
        blockedHostnames: '',
        buttonSize: 'huge',
      }).success,
    ).toBe(false)
  })
})
