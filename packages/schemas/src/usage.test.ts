import { describe, expect, it } from 'vitest'
import {
  TOKENS_PER_FILL,
  fillsRemaining,
  formatTokenUsage,
  isNearQuota,
  isOverQuota,
  isUnlimited,
  tokensToFills,
  usagePercent,
} from './usage'

describe('TOKENS_PER_FILL', () => {
  it('is the documented 250 tokens per standard form fill', () => {
    expect(TOKENS_PER_FILL).toBe(250)
  })
})

describe('isUnlimited', () => {
  it('treats a 0 limit as unlimited', () => {
    expect(isUnlimited(0)).toBe(true)
  })
  it('treats a positive limit as capped', () => {
    expect(isUnlimited(2500)).toBe(false)
  })
})

describe('tokensToFills', () => {
  it('rounds up partial fills', () => {
    expect(tokensToFills(250)).toBe(1)
    expect(tokensToFills(251)).toBe(2)
    expect(tokensToFills(2500)).toBe(10)
  })
  it('is 0 for no usage', () => {
    expect(tokensToFills(0)).toBe(0)
    expect(tokensToFills(-5)).toBe(0)
  })
})

describe('usagePercent', () => {
  it('computes a rounded percentage', () => {
    expect(usagePercent(250_000, 500_000)).toBe(50)
    expect(usagePercent(12_340, 500_000)).toBe(2)
  })
  it('clamps to 100 when over the limit', () => {
    expect(usagePercent(600_000, 500_000)).toBe(100)
  })
  it('is 0 for unlimited plans', () => {
    expect(usagePercent(99_999, 0)).toBe(0)
  })
})

describe('fillsRemaining', () => {
  it('floors the remaining whole fills', () => {
    expect(fillsRemaining(0, 2500)).toBe(10)
    expect(fillsRemaining(1300, 2500)).toBe(4) // 1200 tokens left -> 4 fills
  })
  it('never goes negative when over quota', () => {
    expect(fillsRemaining(3000, 2500)).toBe(0)
  })
  it('is 0 for unlimited plans (callers must check isUnlimited first)', () => {
    expect(fillsRemaining(0, 0)).toBe(0)
  })
})

describe('isOverQuota', () => {
  it('is true at or beyond the limit', () => {
    expect(isOverQuota(2500, 2500)).toBe(true)
    expect(isOverQuota(2501, 2500)).toBe(true)
  })
  it('is false below the limit', () => {
    expect(isOverQuota(2499, 2500)).toBe(false)
  })
  it('is never over for unlimited plans', () => {
    expect(isOverQuota(9_000_000, 0)).toBe(false)
  })
})

describe('isNearQuota', () => {
  it('is true at or above 90% by default', () => {
    expect(isNearQuota(2250, 2500)).toBe(true) // exactly 90%
    expect(isNearQuota(2400, 2500)).toBe(true)
  })
  it('is false below the threshold', () => {
    expect(isNearQuota(2000, 2500)).toBe(false)
  })
  it('honours a custom threshold', () => {
    expect(isNearQuota(1250, 2500, 0.5)).toBe(true)
  })
  it('is never near for unlimited plans', () => {
    expect(isNearQuota(9_000_000, 0)).toBe(false)
  })
})

describe('formatTokenUsage', () => {
  it('renders a grouped used / limit label', () => {
    expect(formatTokenUsage(12_340, 500_000)).toBe('12,340 / 500,000')
  })
  it('drops the denominator for unlimited plans', () => {
    expect(formatTokenUsage(12_340, 0)).toBe('12,340 tokens')
  })
})
