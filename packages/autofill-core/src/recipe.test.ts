import { describe, expect, it } from 'vitest'
import {
  detectedFieldSchema,
  recipeSchema,
  recipeExportSchema,
  type DetectedField,
} from '@quikfill/schemas'
import {
  buildRecipeFieldPlan,
  defaultRecipeRules,
  recipeFieldKey,
  recipeFormKey,
  recipeMatches,
} from './recipe'
const field = (name: string, data: Partial<DetectedField> = {}) =>
  detectedFieldSchema.parse({
    id: name,
    name,
    tagName: 'input',
    inputType: 'text',
    domFingerprint: name,
    ...data,
  })
const fields = [field('first_name'), field('last_name'), field('email')]
const recipe = () =>
  recipeSchema.parse({
    version: 1,
    engineVersion: 1,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'QA',
    origin: 'https://example.com',
    pathname: '/form',
    formKey: recipeFormKey(fields),
    seed: 'repeat',
    locale: 'en-US',
    rules: defaultRecipeRules(fields),
  })
describe('local QA recipes', () => {
  it('round trips versioned scenarios and rejects unknown versions, extra properties and duplicate identities', () => {
    const r = recipe()
    expect(
      recipeExportSchema.parse(
        JSON.parse(JSON.stringify({ format: 'quikfill-recipes', version: 1, recipes: [r] })),
      ).recipes[0],
    ).toEqual(r)
    expect(recipeSchema.safeParse({ ...r, version: 2 }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...r, script: 'alert(1)' }).success).toBe(false)
    expect(recipeSchema.safeParse({ ...r, rules: [r.rules[0], r.rules[0]] }).success).toBe(false)
  })
  it('matches structure and context, not ephemeral ids, values, dynamic options or URL alone', () => {
    const r = recipe()
    expect(recipeFieldKey(fields[0])).toBe(
      recipeFieldKey({
        ...fields[0],
        id: 'next',
        currentValue: 'changed',
        options: [{ label: 'x', value: 'x' }],
      }),
    )
    expect(recipeMatches(r, r)).toBe(true)
    expect(recipeMatches(r, { ...r, origin: 'https://foreign.test' })).toBe(false)
    expect(recipeMatches(r, { ...r, pathname: '/other' })).toBe(false)
    expect(recipeMatches(r, { ...r, formKey: recipeFormKey(fields.slice(1)) })).toBe(false)
  })
  it('replays correlated data with the saved seed and supports fixed/skip rules', () => {
    const r = recipe()
    const values = fields.map((f) => buildRecipeFieldPlan(f, r).instructions[0].proposedValue)
    expect(values[2]).toContain(`${values[0].toLowerCase()}.${values[1].toLowerCase()}`)
    expect(
      fields.map(
        (f) => buildRecipeFieldPlan({ ...f, id: 'rescan' }, r).instructions[0].proposedValue,
      ),
    ).toEqual(values)
    r.rules[0] = { ...r.rules[0], mode: 'fixed', value: 'Fixed' }
    r.rules[1].mode = 'skip'
    expect(buildRecipeFieldPlan(fields[0], r).instructions[0].proposedValue).toBe('Fixed')
    expect(buildRecipeFieldPlan(fields[1], r).skipped[0].reason).toMatch(/scenario/i)
  })
  it('preserves manual values and sensitive fields even for fixed/invalid rules', () => {
    const r = recipe()
    r.rules[2] = { ...r.rules[2], mode: 'fixed', value: 'broken', case: 'invalid' }
    expect(buildRecipeFieldPlan({ ...fields[2], currentValue: 'mine' }, r).instructions).toEqual([])
    const password = field('password', { inputType: 'password' })
    r.rules = defaultRecipeRules([password])
    r.rules[0].mode = 'fixed'
    expect(buildRecipeFieldPlan(password, r).skipped[0].reason).toMatch(/sensitive/i)
  })
  it('builds numeric, date and length boundaries and declines missing constraints', () => {
    const f = field('quantity', { inputType: 'number', min: '2', max: '10', step: '2' })
    const r = recipe()
    r.rules = defaultRecipeRules([f])
    for (const [variant, value] of [
      ['minimum', '2'],
      ['maximum', '10'],
      ['belowMinimum', '0'],
      ['aboveMaximum', '12'],
      ['missing', ''],
    ] as const) {
      r.rules[0].case = variant
      const ins = buildRecipeFieldPlan(f, r).instructions[0]
      expect(ins.proposedValue).toBe(value)
      expect(ins.expectedValidity).toBe(
        ['minimum', 'maximum'].includes(variant) ? 'valid' : 'invalid',
      )
    }
    for (const [f2, expected] of [
      [{ ...f, inputType: 'date', max: '2032-06-05' }, '2032-06-05'],
      [{ ...f, inputType: 'text', maxLength: 5 }, 'xxxxx'],
    ] as const) {
      r.rules = defaultRecipeRules([f2])
      r.rules[0].case = 'maximum'
      expect(buildRecipeFieldPlan(f2, r).instructions[0].proposedValue).toBe(expected)
    }
    expect(buildRecipeFieldPlan(fields[0], recipe()).instructions).toHaveLength(1)
    r.rules = defaultRecipeRules([fields[0]])
    r.rules[0].case = 'maximum'
    expect(buildRecipeFieldPlan(fields[0], r).instructions).toEqual([])
  })
})
