import { describe, expect, it, vi } from 'vitest'
import { detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { buildLocalFillPlan } from './local-fill'

const field = (data: Partial<DetectedField> & { name: string }): DetectedField =>
  detectedFieldSchema.parse({
    id: data.name,
    domFingerprint: data.name,
    tagName: 'input',
    inputType: 'text',
    ...data,
  })

describe('offline local planner', () => {
  it('preserves existing values by default and allows explicit overwrite', () => {
    const fields = [
      field({ name: 'email', currentValue: 'mine@example.com' }),
      field({ name: 'first_name' }),
    ]
    const batch = buildLocalFillPlan(fields, { seed: 'qa' })
    expect(batch.instructions.map((i) => i.detectedFieldId)).toEqual(['first_name'])
    expect(batch.skipped[0].reason).toMatch(/existing value/i)
    expect(buildLocalFillPlan(fields, { seed: 'qa', onlyEmpty: false }).instructions).toHaveLength(
      2,
    )
  })

  it('reproduces a coherent identity after scanner IDs change', () => {
    const fields = ['first_name', 'last_name', 'full_name', 'email', 'username'].map((name) =>
      field({ name }),
    )
    const values = (fields: DetectedField[]) =>
      buildLocalFillPlan(fields, { seed: 'qa' }).instructions.map((i) => i.proposedValue)
    const [first, last, full, email, username] = values(fields)
    expect(full).toBe(`${first} ${last}`)
    expect(email).toContain(`${first.toLowerCase()}.${last.toLowerCase()}`)
    expect(username).toContain(`${first.toLowerCase()}${last.toLowerCase()}`)
    expect(values(fields.map((f, i) => ({ ...f, id: `new-scan-${i}` })))).toEqual(values(fields))
  })

  it('does not generate the same unseeded number on every fill', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const fields = [field({ name: 'quantity', inputType: 'number' })]
    const a = buildLocalFillPlan(fields).instructions[0].proposedValue
    random.mockReturnValue(0.9)
    const b = buildLocalFillPlan(fields).instructions[0].proposedValue
    random.mockRestore()
    expect(a).not.toBe(b)
  })

  it.each([
    ['en-US', 'US', '10001', 'New York'],
    ['en-GB', 'GB', 'SW1A 1AA', 'London'],
    ['sr-RS', 'RS', '11000', 'Beograd'],
  ])('generates regionally consistent address data for %s', (locale, country, zip, city) => {
    const fields = ['country', 'zip', 'city'].map((name) => field({ name }))
    const batch = buildLocalFillPlan(fields, { seed: 'qa', locale })
    expect(batch.instructions.map((i) => i.proposedValue)).toEqual([country, zip, city])
  })

  it('handles per-field number ranges and fractional step without semantic-rule collisions', () => {
    const fields = [
      field({ name: 'price', inputType: 'number', min: '-1.1', max: '-0.5', step: '0.2' }),
      field({ name: 'quantity', inputType: 'number', min: '10000', max: '10000' }),
      field({ name: 'count', inputType: 'number', min: '9', max: '2' }),
    ]
    for (let seed = 0; seed < 20; seed++) {
      const batch = buildLocalFillPlan(fields, { seed })
      expect(batch.instructions).toHaveLength(2)
      const n = Number(batch.instructions[0].proposedValue)
      expect(n).toBeGreaterThanOrEqual(-1.1)
      expect(n).toBeLessThanOrEqual(-0.5)
      expect((n + 1.1) / 0.2).toBeCloseTo(Math.round((n + 1.1) / 0.2))
      expect(batch.instructions[1].proposedValue).toBe('10000')
      expect(batch.skipped[0].detectedFieldId).toBe('count')
    }
  })

  it('honors date bounds, step, and the Unix epoch', () => {
    const fields = [
      field({ name: 'date', inputType: 'date', min: '1970-01-01', max: '1970-01-05', step: '2' }),
    ]
    for (let seed = 0; seed < 10; seed++) {
      expect(['1970-01-01', '1970-01-03', '1970-01-05']).toContain(
        buildLocalFillPlan(fields, { seed }).instructions[0].proposedValue,
      )
    }
  })

  it('never chooses empty/disabled options or unresolved/sensitive fields', () => {
    const fields = [
      field({
        name: 'role',
        tagName: 'select',
        inputType: 'select',
        options: [
          { value: '', label: 'Choose' },
          { value: 'no', label: 'Disabled', disabled: true },
          { value: 'yes', label: 'Yes' },
        ],
      }),
      field({ name: 'password', inputType: 'password' }),
      field({ name: 'ssn' }),
      field({ name: 'xyzzy' }),
      field({ name: 'email', disabled: true }),
    ]
    const batch = buildLocalFillPlan(fields, { seed: 'qa' })
    expect(batch.instructions).toHaveLength(1)
    expect(batch.instructions[0].proposedValue).toBe('yes')
    expect(batch.skipped).toHaveLength(4)
  })

  it('uses each mask independently and refuses incompatible generated values', () => {
    const fields = [
      field({ name: 'phone', mask: '(###) ###-####' }),
      field({ name: 'reference', mask: '@@-###' }),
      field({ name: 'email', maxLength: 3 }),
      field({ name: 'first_name', pattern: '[0-9]+' }),
      field({ name: 'notes', minLength: 100, maxLength: 110 }),
    ]
    const batch = buildLocalFillPlan(fields, { seed: 'qa' })
    expect(batch.instructions[0].proposedValue).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/)
    expect(batch.instructions[1].proposedValue).toMatch(/^[A-Z]{2}-\d{3}$/)
    expect(batch.instructions[2].proposedValue.length).toBeGreaterThanOrEqual(100)
    expect(batch.skipped).toHaveLength(2)
  })

  it('recognizes autocomplete tokens with section and shipping prefixes', () => {
    const batch = buildLocalFillPlan(
      [field({ name: 'x', autocomplete: 'section-checkout shipping given-name' })],
      { seed: 'qa' },
    )
    expect(batch.instructions).toHaveLength(1)
  })
})
