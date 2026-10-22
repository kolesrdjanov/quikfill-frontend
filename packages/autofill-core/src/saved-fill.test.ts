import { describe, it, expect } from 'vitest'
import { detectedFieldSchema, type SavedRecordSnapshot } from '@quikfill/schemas'
import { buildSavedFillPlan } from './saved-fill'

const snapshot: SavedRecordSnapshot = {
  ownerId: 'c6b3ce11-cb07-40a4-a786-800000000001',
  type: {
    id: 'person',
    name: 'Person',
    fields: [
      { key: 'email', label: 'Email', type: 'email', required: false },
      { key: 'firstName', label: 'First name', type: 'text', required: false },
    ],
  },
  record: {
    id: 'record',
    entityTypeId: 'person',
    name: 'Ada',
    values: { email: 'ada@example.com', firstName: 'Ada' },
  },
}
const field = (id: string, name: string, currentValue = '') =>
  detectedFieldSchema.parse({
    id,
    name,
    tagName: 'input',
    inputType: name === 'email' ? 'email' : 'text',
    currentValue,
    domFingerprint: id,
  })
describe('saved record planning', () => {
  it('uses correlated values from the explicitly selected record only', () => {
    const result = buildSavedFillPlan([field('a', 'email'), field('b', 'first_name')], snapshot)
    expect(result.instructions.map((i) => i.proposedValue)).toEqual(['ada@example.com', 'Ada'])
  })
  it('preserves existing values and skips missing/unknown values without generating samples', () => {
    const result = buildSavedFillPlan(
      [field('a', 'email', 'mine@example.com'), field('b', 'last_name'), field('c', 'oddity')],
      snapshot,
    )
    expect(result.instructions).toEqual([])
    expect(result.skipped).toHaveLength(3)
  })
  it('rejects a record attached to another type and skips ambiguous semantics', () => {
    expect(() =>
      buildSavedFillPlan([], {
        ...snapshot,
        record: { ...snapshot.record, entityTypeId: 'other' },
      }),
    ).toThrow('mismatch')
    const ambiguous = {
      ...snapshot,
      type: {
        ...snapshot.type,
        fields: [
          ...snapshot.type.fields,
          { key: 'workEmail', label: 'Work email', type: 'email' as const, required: false },
        ],
      },
    }
    expect(buildSavedFillPlan([field('a', 'email')], ambiguous).instructions).toEqual([])
  })
})
