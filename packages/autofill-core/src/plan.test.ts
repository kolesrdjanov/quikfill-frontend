import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, type DetectedField, type GeneratorRule } from '@quikfill/schemas'
import { resolveFillSource } from './resolve'
import { buildFillPlan, buildPreviewPlan, defaultFillStrategy } from './plan'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

describe('resolveFillSource', () => {
  it('returns static values verbatim', () => {
    expect(resolveFillSource({ sourceType: 'staticValue', value: 'hi' }).value).toBe('hi')
  })

  it('runs a generator rule from the context map', () => {
    const rules: Record<string, GeneratorRule> = { r1: { fieldKey: 'r1', kind: 'email' } }
    const a = resolveFillSource(
      { sourceType: 'generatorRule', ruleKey: 'r1' },
      { seed: 's', rules },
    )
    const b = resolveFillSource(
      { sourceType: 'generatorRule', ruleKey: 'r1' },
      { seed: 's', rules },
    )
    expect(a.value).toBe(b.value)
    expect(a.value).toMatch(/@/)
  })

  it('warns when a generator rule is missing', () => {
    const r = resolveFillSource({ sourceType: 'generatorRule', ruleKey: 'nope' }, {})
    expect(r.value).toBeNull()
    expect(r.requiresConfirmation).toBe(true)
    expect(r.warnings[0]).toMatch(/no generator rule/i)
  })

  it('flags runtime + ai sources as needing input', () => {
    expect(
      resolveFillSource({ sourceType: 'runtimeValue', promptLabel: 'X' }).requiresConfirmation,
    ).toBe(true)
    expect(resolveFillSource({ sourceType: 'aiGenerated', hint: 'x' }).value).toBeNull()
  })

  it('uses user-facing copy for unresolved AI sources (no internal roadmap leak)', () => {
    const r = resolveFillSource({ sourceType: 'aiGenerated', hint: 'x' })
    expect(r.requiresConfirmation).toBe(true)
    expect(r.warnings[0]).toMatch(/no value to fill/i)
    expect(r.warnings.join(' ')).not.toMatch(/iteration/i)
  })

  it('composes parts with a positional template', () => {
    const r = resolveFillSource({
      sourceType: 'composed',
      template: '{0}-{1}',
      parts: [
        { sourceType: 'staticValue', value: 'a' },
        { sourceType: 'staticValue', value: 'b' },
      ],
    })
    expect(r.value).toBe('a-b')
  })
})

describe('defaultFillStrategy', () => {
  it('picks a strategy from the field type', () => {
    expect(defaultFillStrategy(field({ id: 'a', inputType: 'select', tagName: 'select' }))).toBe(
      'select',
    )
    expect(defaultFillStrategy(field({ id: 'b', inputType: 'checkbox' }))).toBe('clickToggle')
    expect(defaultFillStrategy(field({ id: 'c', inputType: 'text' }))).toBe('nativeInput')
    expect(defaultFillStrategy(field({ id: 'd', inputType: 'customSelect', tagName: 'div' }))).toBe(
      'customSelect',
    )
  })

  it('uses assistedAutocomplete for autocomplete-hinted fields, over the type default', () => {
    expect(
      defaultFillStrategy(field({ id: 'e', inputType: 'text', autocompleteHint: 'googlePlaces' })),
    ).toBe('assistedAutocomplete')
  })
})

describe('buildFillPlan', () => {
  it('warns and flags disabled fields', () => {
    const plan = buildFillPlan([
      {
        field: field({ id: 'a', disabled: true }),
        fillSource: { sourceType: 'staticValue', value: 'x' },
      },
    ])
    expect(plan.items[0].warnings.join(' ')).toMatch(/disabled/i)
    expect(plan.items[0].requiresConfirmation).toBe(true)
  })
})

describe('buildPreviewPlan', () => {
  it('produces a deterministic, previewable plan', () => {
    const fields = [
      field({ id: 'email', name: 'email', inputType: 'email' }),
      field({ id: 'name', name: 'first_name' }),
      field({
        id: 'role',
        inputType: 'select',
        tagName: 'select',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'user', label: 'User' },
        ],
      }),
      field({ id: 'mystery', name: 'xyzzy' }),
    ]

    const plan = buildPreviewPlan(fields, { seed: 'seed-1' })
    expect(plan.mode).toBe('preview')
    expect(plan.items).toHaveLength(4)

    const email = plan.items.find((i) => i.detectedFieldId === 'email')!
    expect(email.proposedValue).toMatch(/@/)

    const role = plan.items.find((i) => i.detectedFieldId === 'role')!
    expect(['admin', 'user']).toContain(role.proposedValue)

    // Deterministic with the same seed.
    const again = buildPreviewPlan(fields, { seed: 'seed-1' })
    expect(again.items.map((i) => i.proposedValue)).toEqual(plan.items.map((i) => i.proposedValue))
  })
})
