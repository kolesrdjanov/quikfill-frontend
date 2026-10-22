import { describe, expect, it } from 'vitest'
import { detectedFieldSchema } from '@quikfill/schemas'
import { summarizeFill } from './fill-summary'

const field = (id: string) =>
  detectedFieldSchema.parse({
    id,
    tagName: 'input',
    inputType: 'text',
    selectorCandidates: [],
    domFingerprint: id,
  })

describe('fill result summary', () => {
  it('requires success for every target before reporting Filled', () => {
    const summary = summarizeFill(
      [field('one'), field('two')],
      [
        { detectedFieldId: 'one', status: 'success' },
        { detectedFieldId: 'two', status: 'assisted' },
      ],
    )
    expect(summary.complete).toBe(false)
    expect(summary.description).toBe('1/2 filled · 1 need your input')
  })
  it('includes omitted values and does not count unrelated results', () => {
    const summary = summarizeFill(
      [field('one'), field('two')],
      [
        { detectedFieldId: 'one', status: 'success' },
        { detectedFieldId: 'foreign', status: 'success' },
      ],
    )
    expect(summary.label).toBe('1/2 filled')
    expect(summary.results[1]).toMatchObject({
      status: 'skipped',
      reason: 'No value was proposed for this field.',
    })
  })
  it('never reports an empty attempt as a completed fill', () => {
    expect(summarizeFill([], []).complete).toBe(false)
  })
})
