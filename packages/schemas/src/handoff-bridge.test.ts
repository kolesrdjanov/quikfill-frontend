import { describe, expect, it } from 'vitest'
import {
  QF_EXT_HELLO,
  QF_EXT_HANDOFF,
  extHelloMessageSchema,
  extHandoffMessageSchema,
} from './handoff-bridge'

describe('extHelloMessageSchema', () => {
  it('accepts a hello announcement', () => {
    expect(extHelloMessageSchema.safeParse({ type: QF_EXT_HELLO }).success).toBe(true)
  })

  it('rejects a foreign message type', () => {
    expect(extHelloMessageSchema.safeParse({ type: 'something-else' }).success).toBe(false)
  })
})

describe('extHandoffMessageSchema', () => {
  it('accepts a handoff carrying a code', () => {
    expect(
      extHandoffMessageSchema.safeParse({ type: QF_EXT_HANDOFF, code: 'abc123' }).success,
    ).toBe(true)
  })

  it('rejects a handoff with no code', () => {
    expect(extHandoffMessageSchema.safeParse({ type: QF_EXT_HANDOFF }).success).toBe(false)
  })

  it('rejects a handoff with an empty code', () => {
    expect(extHandoffMessageSchema.safeParse({ type: QF_EXT_HANDOFF, code: '' }).success).toBe(
      false,
    )
  })
})
