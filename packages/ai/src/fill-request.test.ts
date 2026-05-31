import { describe, expect, it } from 'vitest'
import { aiFillRequestSchema, detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { buildAiFillRequest, isNativeFillable, valuesToFillInstructions } from './fill-request'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'abc123',
    ...partial,
  })
}

describe('isNativeFillable', () => {
  it('rejects custom widgets and non-native selects', () => {
    expect(isNativeFillable(field({ id: 'a' }))).toBe(true)
    expect(isNativeFillable(field({ id: 'b', inputType: 'customSelect' }))).toBe(false)
    expect(
      isNativeFillable(
        field({
          id: 'c',
          customWidget: {
            kind: 'select',
            triggerSelectorCandidates: [],
            valueDisplaySelectorCandidates: [],
            optionItemSelector: '[role=option]',
            optionsOpenOnDemand: true,
            isSearchable: false,
            isVirtualized: false,
          },
        }),
      ),
    ).toBe(false)
  })
})

describe('buildAiFillRequest', () => {
  it('produces a schema-valid request with page globals and redacted fields', () => {
    const req = buildAiFillRequest(
      { lang: 'en', title: 'Sign up', description: 'Create your account' },
      [
        field({
          id: 'qf-0',
          inputType: 'email',
          labelText: 'Email',
          name: 'email',
          required: true,
        }),
        field({ id: 'qf-1', inputType: 'text', labelText: 'First name' }),
      ],
    )
    expect(aiFillRequestSchema.safeParse(req).success).toBe(true)
    expect(req.page).toEqual({ lang: 'en', title: 'Sign up', description: 'Create your account' })
    expect(req.fields.map((f) => f.fieldId)).toEqual(['qf-0', 'qf-1'])
    expect(req.fields[0].label).toBe('Email')
    expect(req.fields[0].required).toBe(true)
  })

  it('never leaks the current value or raw HTML', () => {
    const req = buildAiFillRequest({ title: 'X' }, [
      field({
        id: 'qf-0',
        labelText: '<b>Secret</b> Email',
        currentValue: 'super-secret@nope.com',
      }),
    ])
    const serialized = JSON.stringify(req)
    expect(serialized).not.toContain('super-secret@nope.com')
    expect(serialized).not.toContain('<b>')
    expect(req.fields[0].label).toBe('Secret Email')
  })

  it('drops custom/non-native fields before sending', () => {
    const req = buildAiFillRequest({}, [
      field({ id: 'qf-0', inputType: 'text', labelText: 'Name' }),
      field({ id: 'qf-1', inputType: 'customSelect', labelText: 'Country' }),
    ])
    expect(req.fields.map((f) => f.fieldId)).toEqual(['qf-0'])
  })

  it('forwards select option labels', () => {
    const req = buildAiFillRequest({}, [
      field({
        id: 'qf-0',
        inputType: 'select',
        labelText: 'Title',
        options: [
          { value: 'mr', label: 'Mr' },
          { value: 'dr', label: 'Dr' },
        ],
      }),
    ])
    expect(req.fields[0].options).toEqual(['Mr', 'Dr'])
  })

  it('throws when no native fields remain', () => {
    expect(() =>
      buildAiFillRequest({}, [field({ id: 'qf-0', inputType: 'customSelect' })]),
    ).toThrow()
  })
})

describe('valuesToFillInstructions', () => {
  const fields = [
    field({ id: 'qf-0', inputType: 'email', selectorCandidates: ['#email'] }),
    field({ id: 'qf-1', inputType: 'select', selectorCandidates: ['#role'] }),
    field({ id: 'qf-2', inputType: 'checkbox', selectorCandidates: ['#tos'] }),
  ]

  it('maps values back to instructions by fieldId with the right strategy', () => {
    const instructions = valuesToFillInstructions(
      [
        { fieldId: 'qf-0', value: 'a@b.com' },
        { fieldId: 'qf-1', value: 'Admin' },
        { fieldId: 'qf-2', value: 'true' },
      ],
      fields,
    )
    expect(instructions).toHaveLength(3)
    expect(instructions[0]).toMatchObject({
      detectedFieldId: 'qf-0',
      fillStrategy: 'nativeInput',
      proposedValue: 'a@b.com',
    })
    expect(instructions[1].fillStrategy).toBe('select')
    expect(instructions[2].fillStrategy).toBe('clickToggle')
  })

  it('drops values for unknown ids (a hallucinated id never targets an element)', () => {
    const instructions = valuesToFillInstructions(
      [
        { fieldId: 'qf-0', value: 'a@b.com' },
        { fieldId: 'ghost', value: 'x' },
      ],
      fields,
    )
    expect(instructions.map((i) => i.detectedFieldId)).toEqual(['qf-0'])
  })

  it('drops values aimed at custom/non-native fields', () => {
    const custom = [field({ id: 'qf-9', inputType: 'customSelect', selectorCandidates: ['#c'] })]
    expect(valuesToFillInstructions([{ fieldId: 'qf-9', value: 'x' }], custom)).toEqual([])
  })
})
