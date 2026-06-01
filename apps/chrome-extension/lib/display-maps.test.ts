import { describe, expect, it } from 'vitest'
import { confidenceTone, mask, pct } from './display-maps'

describe('confidenceTone', () => {
  it('maps a confidence score to a color band', () => {
    expect(confidenceTone(0.9)).toBe('success') // >= .85
    expect(confidenceTone(0.7)).toBe('primary') // .6 .. .85
    expect(confidenceTone(0.4)).toBe('warning') // < .6
  })
})

describe('pct', () => {
  it('formats a 0..1 confidence as a rounded percentage', () => {
    expect(pct(0.42)).toBe('42%')
    expect(pct(1)).toBe('100%')
  })
})

describe('mask', () => {
  it('returns the value unchanged when not hiding', () => {
    expect(mask('hello@x.com', false)).toBe('hello@x.com')
  })

  it('masks to length-clamped dots when hiding, and never reveals the value', () => {
    expect(mask('secret', true)).toBe('••••••')
    expect(mask('', true)).toBe('')
    expect(mask('a', true)).toBe('••••••') // clamped to a 6-dot minimum
  })
})
