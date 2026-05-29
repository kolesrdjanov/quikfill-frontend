import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, fieldSummarySchema, type DetectedField } from '@quikfill/schemas'
import { buildFieldSummaries, MAX_SUMMARY_TEXT } from './summaries'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

describe('buildFieldSummaries', () => {
  it('never leaks the current value', () => {
    const summaries = buildFieldSummaries([
      field({ id: 'a', labelText: 'Email', currentValue: 'secret-person@example.com' }),
    ])
    expect(JSON.stringify(summaries)).not.toContain('secret-person')
    expect(summaries[0]).not.toHaveProperty('currentValue')
  })

  it('strips HTML markup out of text fields', () => {
    const [summary] = buildFieldSummaries([
      field({
        id: 'a',
        labelText: 'First <b>name</b>',
        nearbyText: '<div class="hint">your given name</div>',
        sectionHeading: '<h2>Contact</h2>',
      }),
    ])
    expect(summary.label).toBe('First name')
    expect(summary.nearbyText).toBe('your given name')
    expect(summary.sectionHeading).toBe('Contact')
    expect(JSON.stringify(summary)).not.toMatch(/[<>]/)
  })

  it('caps oversized text to the size limit', () => {
    const [summary] = buildFieldSummaries([
      field({ id: 'a', labelText: 'x'.repeat(MAX_SUMMARY_TEXT + 500) }),
    ])
    expect(summary.label!.length).toBe(MAX_SUMMARY_TEXT)
  })

  it('caps the number of options and strips HTML from each', () => {
    const options = Array.from({ length: 200 }, (_, i) => ({
      value: `v${i}`,
      label: `<span>Option ${i}</span>`,
    }))
    const [summary] = buildFieldSummaries([
      field({ id: 'a', inputType: 'select', tagName: 'select', options }),
    ])
    expect(summary.options!.length).toBeLessThanOrEqual(50)
    expect(summary.options![0]).toBe('Option 0')
  })

  it('omits optional keys when the field has no data for them', () => {
    const [summary] = buildFieldSummaries([field({ id: 'a' })])
    expect(summary).toEqual({ fieldId: 'a', inputType: 'text' })
  })

  it('always produces schema-valid summaries', () => {
    const summaries = buildFieldSummaries([
      field({ id: 'a', autocomplete: 'given-name', labelText: 'Name' }),
    ])
    for (const s of summaries) expect(() => fieldSummarySchema.parse(s)).not.toThrow()
  })
})
