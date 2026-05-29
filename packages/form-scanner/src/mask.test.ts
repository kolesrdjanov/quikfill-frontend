import { describe, expect, it } from 'vitest'
import { applyMask, coerceToMask, getMaskSpec, valuesMatch, type MaskSpec } from './mask'

const phone: MaskSpec = { pattern: '(###) ###-####', tokens: { '#': /[0-9]/ } }
const ein: MaskSpec = { pattern: '##-#######', tokens: { '#': /[0-9]/ } }

describe('getMaskSpec', () => {
  it('reads a data-maska pattern off an element', () => {
    const el = document.createElement('input')
    el.setAttribute('data-maska', '(###) ###-####')
    expect(getMaskSpec(el)?.pattern).toBe('(###) ###-####')
  })

  it('returns undefined when no mask is present', () => {
    expect(getMaskSpec(document.createElement('input'))).toBeUndefined()
  })

  it('takes the first string entry of an array mask', () => {
    const el = document.createElement('input')
    el.setAttribute('data-maska', '["#### ####", "#### #### ####"]')
    expect(getMaskSpec(el)?.pattern).toBe('#### ####')
  })
})

describe('applyMask', () => {
  it('formats digits into a phone mask, inserting literals', () => {
    expect(applyMask('9767292722', phone)).toBe('(976) 729-2722')
  })

  it('does not double literals already present in the source', () => {
    expect(applyMask('(976) 729-2722', phone)).toBe('(976) 729-2722')
  })

  it('stops cleanly when the source runs short', () => {
    expect(applyMask('976729', phone)).toBe('(976) 729')
  })
})

describe('coerceToMask', () => {
  it('drops a leading country code so the national number fills a phone mask', () => {
    // The original false-failure case: raw +1 number must not shift into the area code.
    expect(coerceToMask('+1-976-729-2722', phone)).toBe('(976) 729-2722')
    expect(coerceToMask('19739915442', phone)).toBe('(973) 991-5442')
  })

  it('keeps a value that already fits', () => {
    expect(coerceToMask('(976) 729-2722', phone)).toBe('(976) 729-2722')
    expect(coerceToMask('12-3456789', ein)).toBe('12-3456789')
  })

  it('truncates the tail for non-phone digit masks that overflow', () => {
    // No phone shape and no +: keep leading digits (maska default behaviour).
    expect(coerceToMask('1234567890', ein)).toBe('12-3456789')
  })
})

describe('valuesMatch', () => {
  it('matches exactly equal values', () => {
    expect(valuesMatch('abc', 'abc')).toBe(true)
  })

  it('matches across formatting differences', () => {
    expect(valuesMatch('(976) 729-2722', '9767292722')).toBe(true)
    expect(valuesMatch('A1 B2', 'a1b2')).toBe(true)
  })

  it('does not match when the alphanumeric core differs', () => {
    expect(valuesMatch('(197) 672-9272', '9767292722')).toBe(false)
  })

  it('does not treat empty/rejected values as a match', () => {
    expect(valuesMatch('', 'user')).toBe(false)
  })
})
