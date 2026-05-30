import { describe, expect, it } from 'vitest'
import type { GeneratorRule } from '@quikfill/schemas'
import { runGenerator } from './generate'

const rule = (kind: GeneratorRule['kind'], options?: Record<string, unknown>): GeneratorRule => ({
  fieldKey: 'f',
  kind,
  options,
})

describe('runGenerator determinism', () => {
  it('is reproducible for the same seed + rule', () => {
    const a = runGenerator(rule('person'), { seed: 'abc' })
    const b = runGenerator(rule('person'), { seed: 'abc' })
    expect(a).toBe(b)
  })

  it('differs across seeds (usually)', () => {
    const outputs = new Set(
      ['s1', 's2', 's3', 's4'].map((seed) => runGenerator(rule('email'), { seed })),
    )
    expect(outputs.size).toBeGreaterThan(1)
  })
})

describe('catalog kinds', () => {
  it('email looks like an email', () => {
    expect(runGenerator(rule('email'), { seed: 'x' })).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  })

  it('phone fills a custom format mask', () => {
    expect(runGenerator(rule('phone', { format: '###' }), { seed: 'x' })).toMatch(/^\d{3}$/)
  })

  it('number honors min/max and decimals', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const v = Number(runGenerator(rule('number', { min: 5, max: 7, decimals: 2 }), { seed }))
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(7)
    }
    expect(runGenerator(rule('number', { min: 0, max: 9, decimals: 2 }), { seed: 'a' })).toMatch(
      /^\d+\.\d{2}$/,
    )
  })

  it('boolean returns true/false or custom labels', () => {
    expect(['true', 'false']).toContain(runGenerator(rule('boolean'), { seed: 'a' }))
    expect(['Yes', 'No']).toContain(
      runGenerator(rule('boolean', { trueValue: 'Yes', falseValue: 'No' }), { seed: 'b' }),
    )
  })

  it('date is an ISO calendar date', () => {
    expect(runGenerator(rule('date'), { seed: 'a' })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('currency carries a symbol and 2 decimals', () => {
    expect(runGenerator(rule('currency'), { seed: 'a' })).toMatch(/^\$\d+\.\d{2}$/)
  })

  it('url is an https website address', () => {
    expect(runGenerator(rule('url'), { seed: 'a' })).toMatch(
      /^https:\/\/www\.[a-z]+\.(com|io|co|net|org)$/,
    )
  })

  it('url honors a custom tld and an omitted subdomain', () => {
    expect(runGenerator(rule('url', { tld: 'dev', subdomain: '' }), { seed: 'a' })).toMatch(
      /^https:\/\/[a-z]+\.dev$/,
    )
  })

  it('selectOption only ever returns one of the field options', () => {
    const opts = ['admin', 'editor', 'viewer']
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(opts).toContain(runGenerator(rule('selectOption'), { seed, fieldOptions: opts }))
    }
  })

  it('selectOption returns empty string when no options exist', () => {
    expect(runGenerator(rule('selectOption'), { seed: 'a' })).toBe('')
  })

  it('customEnum picks from provided values', () => {
    const values = ['red', 'green', 'blue']
    expect(values).toContain(runGenerator(rule('customEnum', { values }), { seed: 'a' }))
  })

  it('patterned fills maska tokens (# digit, @ letter, * alnum)', () => {
    expect(runGenerator(rule('patterned', { format: '##-#######' }), { seed: 'x' })).toMatch(
      /^\d{2}-\d{7}$/,
    )
    expect(runGenerator(rule('patterned', { format: '@@##' }), { seed: 'x' })).toMatch(
      /^[A-Z]{2}\d{2}$/,
    )
  })

  it('handle looks like a username', () => {
    expect(runGenerator(rule('handle'), { seed: 'x' })).toMatch(/^[a-z]+\d{1,2}$/)
  })
})
