import { describe, expect, it } from 'vitest'
import {
  fillsRemaining,
  formatFillUsage,
  isNearQuota,
  isOverQuota,
  isUnlimited,
  usagePercent,
} from './usage'

describe('isUnlimited', () => {
  it('treats a 0 limit as unlimited', () => {
    expect(isUnlimited(0)).toBe(true)
  })
  it('treats a positive limit as capped', () => {
    expect(isUnlimited(200)).toBe(false)
  })
})

describe('usagePercent', () => {
  it('computes a rounded percentage', () => {
    expect(usagePercent(100, 200)).toBe(50)
    expect(usagePercent(47, 200)).toBe(24) // 23.5 -> 24
  })
  it('clamps to 100 when over the limit', () => {
    expect(usagePercent(250, 200)).toBe(100)
  })
  it('is 0 for unlimited plans', () => {
    expect(usagePercent(999, 0)).toBe(0)
  })
})

describe('fillsRemaining', () => {
  it('is the remaining whole fills', () => {
    expect(fillsRemaining(0, 200)).toBe(200)
    expect(fillsRemaining(153, 200)).toBe(47)
  })
  it('never goes negative when over quota', () => {
    expect(fillsRemaining(250, 200)).toBe(0)
  })
  it('is 0 for unlimited plans (callers must check isUnlimited first)', () => {
    expect(fillsRemaining(0, 0)).toBe(0)
  })
})

describe('isOverQuota', () => {
  it('is true at or beyond the limit', () => {
    expect(isOverQuota(200, 200)).toBe(true)
    expect(isOverQuota(201, 200)).toBe(true)
  })
  it('is false below the limit', () => {
    expect(isOverQuota(199, 200)).toBe(false)
  })
  it('is never over for unlimited plans', () => {
    expect(isOverQuota(9_000, 0)).toBe(false)
  })
})

describe('isNearQuota', () => {
  it('is true at or above 90% by default', () => {
    expect(isNearQuota(180, 200)).toBe(true) // exactly 90%
    expect(isNearQuota(195, 200)).toBe(true)
  })
  it('is false below the threshold', () => {
    expect(isNearQuota(150, 200)).toBe(false)
  })
  it('honours a custom threshold', () => {
    expect(isNearQuota(100, 200, 0.5)).toBe(true)
  })
  it('is never near for unlimited plans', () => {
    expect(isNearQuota(9_000, 0)).toBe(false)
  })
})

describe('formatFillUsage', () => {
  it('renders a grouped used / limit label', () => {
    expect(formatFillUsage(1_234, 10_000)).toBe('1,234 / 10,000')
  })
  it('drops the denominator for unlimited plans', () => {
    expect(formatFillUsage(1_234, 0)).toBe('1,234 fills')
  })
})
