import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS } from '@quikfill/schemas'
import { extensionSettingsFormSchema, linesToList, listToLines, signInEmailSchema } from './forms'

describe('signInEmailSchema', () => {
  it('accepts any valid email — sign-in is open; the backend issues a code for any valid email', () => {
    expect(signInEmailSchema.safeParse({ email: 'anyone@example.com' }).success).toBe(true)
  })

  it('still rejects a malformed email', () => {
    expect(signInEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})

describe('linesToList', () => {
  it('splits a textarea into a trimmed, non-empty list', () => {
    expect(linesToList(' bank.example.com \n\n admin.work.example , dup.example \n')).toEqual([
      'bank.example.com',
      'admin.work.example',
      'dup.example',
    ])
  })

  it('treats an empty/whitespace/undefined textarea as an empty list', () => {
    expect(linesToList('   \n  ')).toEqual([])
    expect(linesToList(undefined)).toEqual([])
  })

  it('round-trips with listToLines', () => {
    expect(listToLines(['a.example', 'b.example'])).toBe('a.example\nb.example')
    expect(linesToList(listToLines(['a.example', 'b.example']))).toEqual(['a.example', 'b.example'])
  })
})

describe('extensionSettingsFormSchema', () => {
  // Regression — "Save changes" did nothing: blockedHostnames MUST stay a plain
  // string in the form schema (NOT a Zod transform). VeeValidate writes a
  // transform's array OUTPUT back into the form state and re-validates it as
  // INPUT, which fails ("Expected string, received array") and silently blocks
  // submit. The split now happens at submit time via linesToList instead.
  it('keeps the blocked-hostnames textarea as a raw string (no in-schema transform)', () => {
    const parsed = extensionSettingsFormSchema.parse({
      ...DEFAULT_EXTENSION_SETTINGS,
      blockedHostnames: 'bank.example.com\nadmin.work.example',
      allowedHostnames: '',
    })
    expect(parsed.blockedHostnames).toBe('bank.example.com\nadmin.work.example')
  })

  it('re-validates its own parsed output (mirrors VeeValidate write-back)', () => {
    const parsed = extensionSettingsFormSchema.parse({
      ...DEFAULT_EXTENSION_SETTINGS,
      blockedHostnames: 'bank.example.com',
      allowedHostnames: '',
    })
    // Parsing the output again — what VeeValidate does on every validation pass —
    // must still succeed. A string→array transform would fail here.
    expect(extensionSettingsFormSchema.safeParse(parsed).success).toBe(true)
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
