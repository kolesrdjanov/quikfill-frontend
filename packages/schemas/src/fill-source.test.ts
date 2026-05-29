import { describe, expect, it } from 'vitest'
import { fillSourceSchema, type FillSource } from './fill-source'

describe('fillSourceSchema', () => {
  it('parses every non-composed variant round-trip', () => {
    const variants: FillSource[] = [
      { sourceType: 'recordField', entityTypeId: 't1', fieldKey: 'firstName' },
      { sourceType: 'recordField', entityTypeId: 't1', recordId: 'r1', fieldKey: 'firstName' },
      { sourceType: 'generatorRule', ruleKey: 'email' },
      { sourceType: 'generatorRule', presetId: 'p1', ruleKey: 'email' },
      { sourceType: 'staticValue', value: 'Acme Inc' },
      { sourceType: 'runtimeValue', promptLabel: 'Enter unit #' },
      { sourceType: 'aiGenerated', hint: 'plausible US address' },
    ]
    for (const v of variants) {
      expect(fillSourceSchema.parse(v)).toEqual(v)
    }
  })

  it('parses a recursively composed source', () => {
    const composed: FillSource = {
      sourceType: 'composed',
      template: '{a} {b}',
      parts: [
        { sourceType: 'staticValue', value: 'a' },
        {
          sourceType: 'composed',
          template: '{c}',
          parts: [{ sourceType: 'generatorRule', ruleKey: 'company' }],
        },
      ],
    }
    expect(fillSourceSchema.parse(composed)).toEqual(composed)
  })

  it('rejects an unknown sourceType (discriminated union)', () => {
    expect(() => fillSourceSchema.parse({ sourceType: 'nope', value: 'x' })).toThrow()
  })

  it('rejects a variant missing a required field', () => {
    expect(() => fillSourceSchema.parse({ sourceType: 'staticValue' })).toThrow()
    expect(() =>
      fillSourceSchema.parse({ sourceType: 'recordField', entityTypeId: 't1' }),
    ).toThrow()
  })
})
