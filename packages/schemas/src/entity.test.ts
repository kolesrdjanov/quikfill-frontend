import { describe, expect, it } from 'vitest'
import { entityFieldDefSchema, entityRecordSchema, entityTypeSchema } from './entity'

describe('entityFieldDefSchema', () => {
  it('defaults required to false', () => {
    const parsed = entityFieldDefSchema.parse({
      key: 'firstName',
      label: 'First name',
      type: 'text',
    })
    expect(parsed.required).toBe(false)
  })

  it('enforces required key and label', () => {
    expect(() => entityFieldDefSchema.parse({ label: 'x', type: 'text' })).toThrow()
    expect(() => entityFieldDefSchema.parse({ key: '', label: 'x', type: 'text' })).toThrow()
  })

  it('rejects an unknown field type', () => {
    expect(() => entityFieldDefSchema.parse({ key: 'k', label: 'l', type: 'datetime' })).toThrow()
  })
})

describe('entityTypeSchema', () => {
  it('parses a type with enum field options round-trip', () => {
    const type = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Person',
      fields: [
        { key: 'role', label: 'Role', type: 'enum' as const, required: true, options: ['a', 'b'] },
      ],
    }
    const parsed = entityTypeSchema.parse(type)
    expect(parsed.fields[0].options).toEqual(['a', 'b'])
  })
})

describe('entityRecordSchema', () => {
  it('parses arbitrary value maps keyed by field key', () => {
    const record = {
      id: '22222222-2222-4222-8222-222222222222',
      entityTypeId: '11111111-1111-4111-8111-111111111111',
      name: 'Jane',
      values: { firstName: 'Jane', age: 31, active: true },
    }
    expect(entityRecordSchema.parse(record).values.firstName).toBe('Jane')
  })

  it('rejects a non-uuid id', () => {
    expect(() =>
      entityRecordSchema.parse({ id: 'nope', entityTypeId: 'nope', name: 'x', values: {} }),
    ).toThrow()
  })
})
