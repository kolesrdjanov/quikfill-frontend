import { describe, expect, it } from 'vitest'
import { aiFillRequestSchema, detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import {
  buildAiFillRequest,
  isFillableField,
  isNativeFillable,
  valuesToFillInstructions,
} from './fill-request'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'abc123',
    ...partial,
  })
}

const WIDGET = {
  kind: 'select' as const,
  triggerSelectorCandidates: ['[data-trigger="select"]'],
  valueDisplaySelectorCandidates: [],
  optionItemSelector: '[role=option]',
  optionsOpenOnDemand: true,
  isSearchable: false,
  isVirtualized: false,
}

/** A detected custom select (`<div>`-based dropdown) carrying a click descriptor. */
function customSelect(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return field({ tagName: 'div', inputType: 'customSelect', customWidget: WIDGET, ...partial })
}

describe('isNativeFillable', () => {
  it('rejects custom widgets and non-native selects', () => {
    expect(isNativeFillable(field({ id: 'a' }))).toBe(true)
    expect(isNativeFillable(field({ id: 'b', inputType: 'customSelect' }))).toBe(false)
    expect(isNativeFillable(customSelect({ id: 'c' }))).toBe(false)
  })
})

describe('isFillableField', () => {
  it('accepts native inputs and custom selects with a descriptor; rejects descriptor-less ones', () => {
    expect(isFillableField(field({ id: 'a' }))).toBe(true)
    expect(isFillableField(customSelect({ id: 'b' }))).toBe(true)
    // A customSelect with no customWidget can't be driven, so it stays excluded.
    expect(isFillableField(field({ id: 'c', inputType: 'customSelect' }))).toBe(false)
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

  it('drops a descriptor-less custom select (nothing to drive) but keeps native fields', () => {
    const req = buildAiFillRequest({}, [
      field({ id: 'qf-0', inputType: 'text', labelText: 'Name' }),
      field({ id: 'qf-1', inputType: 'customSelect', labelText: 'Country' }),
    ])
    expect(req.fields.map((f) => f.fieldId)).toEqual(['qf-0'])
  })

  it('includes a custom select that carries a widget descriptor (with its option labels)', () => {
    const req = buildAiFillRequest({}, [
      field({ id: 'qf-0', inputType: 'text', labelText: 'City' }),
      customSelect({
        id: 'qf-1',
        labelText: 'Country',
        name: 'address.country',
        options: [
          { value: 'United States', label: 'United States', selected: false },
          { value: 'Canada', label: 'Canada', selected: false },
        ],
      }),
    ])
    expect(req.fields.map((f) => f.fieldId)).toEqual(['qf-0', 'qf-1'])
    const country = req.fields[1]
    expect(country.inputType).toBe('customSelect')
    expect(country.label).toBe('Country')
    expect(country.options).toEqual(['United States', 'Canada'])
  })

  it('includes a closed custom select that has no options yet (filler reads them at fill time)', () => {
    const req = buildAiFillRequest({}, [customSelect({ id: 'qf-1', labelText: 'Country' })])
    expect(req.fields.map((f) => f.fieldId)).toEqual(['qf-1'])
    expect(req.fields[0].options).toBeUndefined()
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

  it('throws when no fillable fields remain', () => {
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

  it('drops values aimed at a descriptor-less custom select', () => {
    const custom = [field({ id: 'qf-9', inputType: 'customSelect', selectorCandidates: ['#c'] })]
    expect(valuesToFillInstructions([{ fieldId: 'qf-9', value: 'x' }], custom)).toEqual([])
  })

  it('maps a custom select to a customSelect instruction carrying its widget descriptor', () => {
    const custom = [customSelect({ id: 'qf-9', selectorCandidates: ['[data-qf-id="qf-9"]'] })]
    const instructions = valuesToFillInstructions(
      [{ fieldId: 'qf-9', value: 'United States' }],
      custom,
    )
    expect(instructions).toHaveLength(1)
    expect(instructions[0]).toMatchObject({
      detectedFieldId: 'qf-9',
      fillStrategy: 'customSelect',
      proposedValue: 'United States',
    })
    expect(instructions[0].customWidget?.optionItemSelector).toBe('[role=option]')
  })
})
