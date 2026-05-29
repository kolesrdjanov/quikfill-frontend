import { describe, expect, it } from 'vitest'
import { aiSuggestionSchema, fieldSummarySchema } from './ai'
import { detectedFieldSchema } from './detected-field'
import { fieldMappingSchema } from './field-mapping'
import { fillPlanSchema, fillRunSchema } from './fill'
import { domainSchema, formProfileSchema } from './form-profile'
import { generatorPresetSchema } from './generator'
import { userAccountSchema } from './user'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

describe('userAccountSchema', () => {
  it('allows an implicit local account with no email', () => {
    expect(userAccountSchema.parse({ id: UUID_A }).email).toBeUndefined()
  })
  it('rejects a malformed email', () => {
    expect(() => userAccountSchema.parse({ id: UUID_A, email: 'nope' })).toThrow()
  })
})

describe('generatorPresetSchema', () => {
  it('applies locale and seedMode defaults', () => {
    const parsed = generatorPresetSchema.parse({
      id: UUID_A,
      name: 'Default',
      rules: [{ fieldKey: 'email', kind: 'email' }],
    })
    expect(parsed.locale).toBe('en')
    expect(parsed.seedMode).toBe('random')
  })
})

describe('form model', () => {
  it('parses a domain and form profile with structure metadata', () => {
    expect(
      domainSchema.parse({ id: UUID_A, name: 'Acme', hostnames: ['acme.com'] }).hostnames,
    ).toEqual(['acme.com'])
    const profile = formProfileSchema.parse({
      id: UUID_B,
      domainId: UUID_A,
      name: 'Signup',
      structureMetadata: { sectionHeadings: ['Contact'], fieldCount: 4, structureHash: 'abc' },
    })
    expect(profile.structureMetadata?.fieldCount).toBe(4)
  })

  it('applies detected-field defaults', () => {
    const f = detectedFieldSchema.parse({
      id: 'f1',
      tagName: 'input',
      inputType: 'text',
      domFingerprint: 'fp',
    })
    expect(f).toMatchObject({ required: false, visible: true, frame: 'main', shadow: false })
    expect(f.classNames).toEqual([])
  })

  it('parses a field mapping carrying a fill source', () => {
    const mapping = fieldMappingSchema.parse({
      id: UUID_A,
      formProfileId: UUID_B,
      fieldFingerprint: 'fp',
      target: { fieldFingerprint: 'fp' },
      fillSource: { sourceType: 'staticValue', value: 'x' },
      fillStrategy: 'nativeInput',
    })
    expect(mapping.confidence).toBe(0)
    expect(mapping.target.frame).toBe('main')
  })
})

describe('fill plan + run', () => {
  it('parses a preview plan', () => {
    const plan = fillPlanSchema.parse({
      mode: 'preview',
      items: [
        {
          detectedFieldId: 'f1',
          label: 'Email',
          proposedValue: 'a@b.com',
          fillSource: { sourceType: 'generatorRule', ruleKey: 'email' },
          fillStrategy: 'nativeInput',
          confidence: 0.9,
        },
      ],
    })
    expect(plan.items[0].requiresConfirmation).toBe(false)
  })

  it('parses a fill run with a redacted plan (no raw values)', () => {
    const run = fillRunSchema.parse({
      id: UUID_A,
      url: 'https://acme.com/signup',
      mode: 'fill',
      status: 'success',
      plan: [
        {
          detectedFieldId: 'f1',
          label: 'Email',
          fillSourceType: 'generatorRule',
          confidence: 0.9,
          fillStrategy: 'nativeInput',
        },
      ],
      results: [{ detectedFieldId: 'f1', status: 'success', acceptedValue: 'a@b.com' }],
      startedAt: '2026-05-29T12:00:00.000Z',
    })
    expect(run.plan[0].fillSourceType).toBe('generatorRule')
    expect(run.plan[0]).not.toHaveProperty('proposedValue')
  })
})

describe('ai contracts', () => {
  it('parses a redacted field summary', () => {
    const s = fieldSummarySchema.parse({ fieldId: 'f1', inputType: 'text', label: 'First name' })
    expect(s).not.toHaveProperty('currentValue')
  })

  it('enforces confidence bounds on suggestions', () => {
    expect(() =>
      aiSuggestionSchema.parse({
        fieldId: 'f1',
        semanticType: 'person.firstName',
        confidence: 1.5,
        reasons: [],
      }),
    ).toThrow()
  })
})
