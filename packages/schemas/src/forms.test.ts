import { describe, expect, it } from 'vitest'
import { detectedFormSchema } from './forms'

describe('detectedFormSchema', () => {
  it('parses a full form with defaults applied', () => {
    const parsed = detectedFormSchema.parse({
      formId: 'form-0',
      fieldIds: ['qf-0', 'qf-1'],
      submitSelectorCandidates: ['button[type="submit"]'],
      frame: 'main',
      label: 'Sign up',
    })
    expect(parsed.fieldIds).toEqual(['qf-0', 'qf-1'])
    expect(parsed.submitSelectorCandidates).toEqual(['button[type="submit"]'])
  })

  it('defaults arrays/frame and allows a missing submit + label', () => {
    const parsed = detectedFormSchema.parse({ formId: 'form-1' })
    expect(parsed.fieldIds).toEqual([])
    expect(parsed.submitSelectorCandidates).toEqual([])
    expect(parsed.frame).toBe('main')
    expect(parsed.label).toBeUndefined()
  })

  it('rejects an empty formId', () => {
    expect(detectedFormSchema.safeParse({ formId: '' }).success).toBe(false)
  })
})
