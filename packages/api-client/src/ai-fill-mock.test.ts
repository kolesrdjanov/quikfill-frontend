import { describe, expect, it } from 'vitest'
import type { AiFillRequest } from '@quikfill/schemas'
import { mockAiFill } from './ai-fill-mock'

function req(fields: AiFillRequest['fields']): AiFillRequest {
  return { page: { lang: 'en', title: '', description: '' }, fields }
}

describe('mockAiFill', () => {
  it('returns one value per field, keyed by the sent fieldId', () => {
    const res = mockAiFill(
      req([
        { fieldId: 'qf-0', inputType: 'email', required: true },
        { fieldId: 'qf-1', inputType: 'text', label: 'First name', required: false },
      ]),
    )
    expect(res.values.map((v) => v.fieldId)).toEqual(['qf-0', 'qf-1'])
    expect(res.values.every((v) => v.value.length > 0)).toBe(true)
  })

  it('is deterministic for the same input', () => {
    const fields = req([{ fieldId: 'qf-0', inputType: 'email', required: true }])
    expect(mockAiFill(fields)).toEqual(mockAiFill(fields))
  })

  it('picks plausible values from inputType + label hints', () => {
    const res = mockAiFill(
      req([
        { fieldId: 'a', inputType: 'email', required: false },
        { fieldId: 'b', inputType: 'text', label: 'First name', required: false },
        { fieldId: 'c', inputType: 'tel', label: 'Phone', required: false },
        { fieldId: 'd', inputType: 'text', label: 'ZIP code', required: false },
      ]),
    )
    const byId = Object.fromEntries(res.values.map((v) => [v.fieldId, v.value]))
    expect(byId.a).toContain('@')
    expect(byId.b).toBe('Jane')
    expect(byId.c).toMatch(/\d/)
    expect(byId.d).toBe('94016')
  })

  it('takes the first option for an enum/select field', () => {
    const res = mockAiFill(
      req([{ fieldId: 'q', inputType: 'select', options: ['Mr', 'Mrs', 'Dr'], required: false }]),
    )
    expect(res.values[0].value).toBe('Mr')
  })
})
