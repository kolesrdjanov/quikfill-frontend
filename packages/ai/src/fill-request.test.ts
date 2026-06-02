import { describe, expect, it } from 'vitest'
import { aiFillRequestSchema, detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import {
  buildAiFillRequest,
  isAiFillableField,
  isFillableField,
  isNativeFillable,
  localPickInstructions,
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

const DATEPICKER_WIDGET = {
  ...WIDGET,
  kind: 'datepicker' as const,
  optionItemSelector: '[role="option"], [role="gridcell"]',
}

/** A detected custom select (`<div>`-based dropdown) carrying a click descriptor. */
function customSelect(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return field({ tagName: 'div', inputType: 'customSelect', customWidget: WIDGET, ...partial })
}

/** A probed datepicker: a native text input that gained a datepicker descriptor. */
function datepicker(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return field({
    tagName: 'input',
    inputType: 'text',
    customWidget: DATEPICKER_WIDGET,
    placeholder: 'mm / dd / yyyy',
    ...partial,
  })
}

describe('isNativeFillable', () => {
  it('rejects custom widgets and non-native selects', () => {
    expect(isNativeFillable(field({ id: 'a' }))).toBe(true)
    expect(isNativeFillable(field({ id: 'b', inputType: 'customSelect' }))).toBe(false)
    expect(isNativeFillable(customSelect({ id: 'c' }))).toBe(false)
    expect(isNativeFillable(datepicker({ id: 'd' }))).toBe(false)
  })
})

describe('isFillableField', () => {
  it('accepts native inputs and any widget with a descriptor; rejects descriptor-less ones', () => {
    expect(isFillableField(field({ id: 'a' }))).toBe(true)
    expect(isFillableField(customSelect({ id: 'b' }))).toBe(true)
    expect(isFillableField(datepicker({ id: 'd' }))).toBe(true)
    // A customSelect with no customWidget can't be driven, so it stays excluded.
    expect(isFillableField(field({ id: 'c', inputType: 'customSelect' }))).toBe(false)
  })
})

describe('isAiFillableField', () => {
  it('excludes custom selects (locally picked) but keeps natives and datepickers', () => {
    expect(isAiFillableField(field({ id: 'a' }))).toBe(true)
    expect(isAiFillableField(datepicker({ id: 'b' }))).toBe(true)
    expect(isAiFillableField(customSelect({ id: 'c' }))).toBe(false)
    expect(
      isAiFillableField(
        customSelect({ id: 'd', customWidget: { ...WIDGET, kind: 'multiselect' } }),
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
    expect(req).not.toBeNull()
    expect(aiFillRequestSchema.safeParse(req).success).toBe(true)
    expect(req!.page).toEqual({ lang: 'en', title: 'Sign up', description: 'Create your account' })
    expect(req!.fields.map((f) => f.fieldId)).toEqual(['qf-0', 'qf-1'])
    expect(req!.fields[0].label).toBe('Email')
    expect(req!.fields[0].required).toBe(true)
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
    expect(req!.fields[0].label).toBe('Secret Email')
  })

  it('excludes custom selects — their value is picked locally, never by the AI', () => {
    const req = buildAiFillRequest({}, [
      field({ id: 'qf-0', inputType: 'text', labelText: 'City' }),
      customSelect({
        id: 'qf-1',
        labelText: 'Country',
        options: [{ value: 'Canada', label: 'Canada', selected: false }],
      }),
    ])
    expect(req!.fields.map((f) => f.fieldId)).toEqual(['qf-0'])
  })

  it('drops a descriptor-less custom select (nothing to drive) but keeps native fields', () => {
    const req = buildAiFillRequest({}, [
      field({ id: 'qf-0', inputType: 'text', labelText: 'Name' }),
      field({ id: 'qf-1', inputType: 'customSelect', labelText: 'Country' }),
    ])
    expect(req!.fields.map((f) => f.fieldId)).toEqual(['qf-0'])
  })

  it('includes a probed datepicker with its min/max constraints', () => {
    const req = buildAiFillRequest({}, [
      datepicker({ id: 'qf-2', labelText: 'Paid Through Date', min: '2032-06-01' }),
    ])
    expect(req!.fields.map((f) => f.fieldId)).toEqual(['qf-2'])
    expect(req!.fields[0].min).toBe('2032-06-01')
    expect(req!.fields[0].placeholder).toBe('mm / dd / yyyy')
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
    expect(req!.fields[0].options).toEqual(['Mr', 'Dr'])
  })

  it('returns null when nothing AI-fillable remains (a form of only dropdowns)', () => {
    expect(buildAiFillRequest({}, [customSelect({ id: 'qf-0' })])).toBeNull()
    expect(buildAiFillRequest({}, [field({ id: 'qf-1', inputType: 'customSelect' })])).toBeNull()
    expect(buildAiFillRequest({}, [])).toBeNull()
  })
})

describe('localPickInstructions', () => {
  const options = [
    { value: 'Marko', label: 'Marko', selected: false },
    { value: 'Full Permissions', label: 'Full Permissions', selected: false },
    { value: 'Kobac', label: 'Kobac', selected: false },
  ]

  it('picks a random option from a probed custom select', () => {
    const fields = [
      customSelect({
        id: 'qf-6',
        labelText: 'Role',
        selectorCandidates: ['[name="roleId"]'],
        options,
        customWidget: { ...WIDGET, optionsProbed: true },
      }),
    ]
    const instructions = localPickInstructions(fields)
    expect(instructions).toHaveLength(1)
    expect(instructions[0]).toMatchObject({ detectedFieldId: 'qf-6', fillStrategy: 'customSelect' })
    expect(options.map((o) => o.label)).toContain(instructions[0].proposedValue)
    expect(instructions[0].customWidget?.optionsProbed).toBe(true)
  })

  it('skips remote selects (options never rendered) — they stay blank', () => {
    const fields = [customSelect({ id: 'qf-1', customWidget: { ...WIDGET, remoteOptions: true } })]
    expect(localPickInstructions(fields)).toEqual([])
  })

  it('skips widgets with nothing harvested, natives, and datepickers', () => {
    const fields = [
      customSelect({ id: 'qf-1' }), // no options
      field({ id: 'qf-2', labelText: 'Email' }), // native
      datepicker({ id: 'qf-3', options }), // datepicker — AI-driven
    ]
    expect(localPickInstructions(fields)).toEqual([])
  })

  it('picks for a multiselect too (one random option)', () => {
    const fields = [
      customSelect({
        id: 'qf-4',
        options,
        customWidget: { ...WIDGET, kind: 'multiselect', optionsProbed: true },
      }),
    ]
    const instructions = localPickInstructions(fields)
    expect(instructions).toHaveLength(1)
    expect(options.map((o) => o.label)).toContain(instructions[0].proposedValue)
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

  it('drops an AI value aimed at a custom select — those are locally picked', () => {
    const custom = [customSelect({ id: 'qf-9', selectorCandidates: ['[data-qf-id="qf-9"]'] })]
    expect(valuesToFillInstructions([{ fieldId: 'qf-9', value: 'United States' }], custom)).toEqual(
      [],
    )
  })

  it('maps a probed datepicker to a customSelect instruction carrying its descriptor', () => {
    const fields2 = [datepicker({ id: 'qf-9', selectorCandidates: ['[data-qf-id="qf-9"]'] })]
    const instructions = valuesToFillInstructions(
      [{ fieldId: 'qf-9', value: '06/15/2032' }],
      fields2,
    )
    expect(instructions).toHaveLength(1)
    expect(instructions[0]).toMatchObject({
      detectedFieldId: 'qf-9',
      fillStrategy: 'customSelect',
      proposedValue: '06/15/2032',
    })
    expect(instructions[0].customWidget?.kind).toBe('datepicker')
  })
})
