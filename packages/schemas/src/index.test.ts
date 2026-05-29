import { describe, expect, it } from 'vitest'
import { placeholderSchema } from './index'

describe('placeholderSchema', () => {
  it('parses a valid object', () => {
    expect(placeholderSchema.parse({ ok: true })).toEqual({ ok: true })
  })

  it('rejects an invalid object', () => {
    expect(() => placeholderSchema.parse({ ok: false })).toThrow()
  })
})
