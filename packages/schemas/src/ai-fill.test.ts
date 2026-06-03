import { describe, expect, it } from 'vitest'
import {
  aiFillFieldSchema,
  aiFillPreferencesSchema,
  aiFillRequestSchema,
  aiFillResponseSchema,
} from './ai-fill'

describe('aiFillFieldSchema', () => {
  it('parses redacted field metadata and defaults required', () => {
    const parsed = aiFillFieldSchema.parse({
      fieldId: 'qf-0',
      inputType: 'email',
      label: 'Email',
      pattern: '.+@.+',
    })
    expect(parsed.fieldId).toBe('qf-0')
    expect(parsed.required).toBe(false)
    expect(parsed.pattern).toBe('.+@.+')
  })

  it('rejects an empty fieldId', () => {
    expect(aiFillFieldSchema.safeParse({ fieldId: '', inputType: 'text' }).success).toBe(false)
  })

  it('strips an unknown key (a leaked current value never survives parsing)', () => {
    const parsed = aiFillFieldSchema.parse({
      fieldId: 'qf-0',
      inputType: 'text',
      currentValue: 'secret',
    })
    expect('currentValue' in parsed).toBe(false)
  })
})

describe('aiFillRequestSchema', () => {
  it('round-trips a full request', () => {
    const req = {
      page: { lang: 'en', title: 'Contact', description: 'Reach us' },
      fields: [
        { fieldId: 'qf-0', inputType: 'text', label: 'Name', required: true },
        { fieldId: 'qf-1', inputType: 'email', label: 'Email', required: false },
      ],
    }
    const parsed = aiFillRequestSchema.parse(req)
    expect(parsed.fields).toHaveLength(2)
    expect(parsed.page.lang).toBe('en')
  })

  it('defaults page globals to empty strings', () => {
    const parsed = aiFillRequestSchema.parse({
      page: {},
      fields: [{ fieldId: 'qf-0', inputType: 'text' }],
    })
    expect(parsed.page).toEqual({ lang: '', title: '', description: '' })
  })

  it('rejects an empty fields array', () => {
    expect(aiFillRequestSchema.safeParse({ page: {}, fields: [] }).success).toBe(false)
  })

  it('accepts an optional preferences block and round-trips dateFormat', () => {
    const parsed = aiFillRequestSchema.parse({
      page: {},
      fields: [{ fieldId: 'qf-0', inputType: 'text' }],
      preferences: { dateFormat: 'DD/MM/YYYY' },
    })
    expect(parsed.preferences).toEqual({ dateFormat: 'DD/MM/YYYY' })
  })

  it('parses a request with no preferences (the default wire shape)', () => {
    const parsed = aiFillRequestSchema.parse({
      page: {},
      fields: [{ fieldId: 'qf-0', inputType: 'text' }],
    })
    expect(parsed.preferences).toBeUndefined()
  })

  it('rejects an unknown dateFormat', () => {
    expect(
      aiFillRequestSchema.safeParse({
        page: {},
        fields: [{ fieldId: 'qf-0', inputType: 'text' }],
        preferences: { dateFormat: 'DD-MM' },
      }).success,
    ).toBe(false)
  })
})

describe('aiFillPreferencesSchema', () => {
  it('allows an empty object and a valid dateFormat', () => {
    expect(aiFillPreferencesSchema.parse({}).dateFormat).toBeUndefined()
    expect(aiFillPreferencesSchema.parse({ dateFormat: 'YYYY-MM-DD' }).dateFormat).toBe(
      'YYYY-MM-DD',
    )
  })
})

describe('aiFillResponseSchema', () => {
  it('parses values keyed by fieldId', () => {
    const parsed = aiFillResponseSchema.parse({
      values: [{ fieldId: 'qf-0', value: 'Jane Doe' }],
    })
    expect(parsed.values[0]).toEqual({ fieldId: 'qf-0', value: 'Jane Doe' })
  })

  it('defaults to an empty values array', () => {
    expect(aiFillResponseSchema.parse({}).values).toEqual([])
  })

  it('rejects a non-string value', () => {
    expect(
      aiFillResponseSchema.safeParse({ values: [{ fieldId: 'qf-0', value: 5 }] }).success,
    ).toBe(false)
  })
})
