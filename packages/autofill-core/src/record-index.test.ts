import { describe, expect, it } from 'vitest'
import type { EntityRecord, EntityType } from '@quikfill/schemas'
import {
  buildRecordIndex,
  recordMatchForSemanticType,
  recordValuesById,
  semanticTypeForEntityField,
} from './record-index'

const personType: EntityType = {
  id: 'person',
  name: 'Person',
  fields: [
    { key: 'firstName', label: 'First name', type: 'text', required: false },
    { key: 'lastName', label: 'Last name', type: 'text', required: false },
    { key: 'email', label: 'Email', type: 'email', required: false },
    { key: 'note', label: 'Note', type: 'notes', required: false },
  ],
}

const record = (id: string, values: Record<string, unknown>): EntityRecord => ({
  id,
  entityTypeId: 'person',
  name: id,
  values,
})

describe('semanticTypeForEntityField', () => {
  it('maps a typed field straight to its semantic type', () => {
    expect(semanticTypeForEntityField(personType.fields[2])).toBe('email')
    expect(semanticTypeForEntityField(personType.fields[3])).toBe('notes')
  })

  it('classifies an untyped text field by its key/label', () => {
    expect(semanticTypeForEntityField(personType.fields[0])).toBe('person.firstName')
    expect(semanticTypeForEntityField(personType.fields[1])).toBe('person.lastName')
  })
})

describe('buildRecordIndex', () => {
  it('indexes only fields that hold a non-empty value in some record', () => {
    const index = buildRecordIndex([personType], [record('r1', { firstName: 'Ada', email: '' })])
    expect(recordMatchForSemanticType(index, 'person.firstName')).toEqual({
      entityTypeId: 'person',
      recordId: 'r1',
      fieldKey: 'firstName',
    })
    // email is present but blank → not indexed (no value to fill).
    expect(recordMatchForSemanticType(index, 'email')).toBeNull()
    // lastName never set → not indexed.
    expect(recordMatchForSemanticType(index, 'person.lastName')).toBeNull()
  })

  it('picks the first record that actually has a value', () => {
    const index = buildRecordIndex(
      [personType],
      [record('r1', { firstName: '' }), record('r2', { firstName: 'Grace' })],
    )
    expect(recordMatchForSemanticType(index, 'person.firstName')?.recordId).toBe('r2')
  })

  it('returns null for a semantic type with no saved data', () => {
    const index = buildRecordIndex([personType], [])
    expect(recordMatchForSemanticType(index, 'address.zip')).toBeNull()
  })
})

describe('recordValuesById', () => {
  it('shapes records into a recordId → values map for ResolveContext', () => {
    expect(recordValuesById([record('r1', { firstName: 'Ada' })])).toEqual({
      r1: { firstName: 'Ada' },
    })
  })
})
