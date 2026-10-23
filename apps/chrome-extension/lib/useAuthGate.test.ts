import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@quikfill/schemas'

const { snapshot, verify } = vi.hoisted(() => ({ snapshot: vi.fn(), verify: vi.fn() }))
vi.mock('@quikfill/browser-adapter', () => ({
  AUTH_STATE_KEY: 'auth:state',
  requestAuthState: snapshot,
  verifyAuthCode: verify,
  requestAuthCode: vi.fn(),
  logoutAuth: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
  vi.stubGlobal('browser', {
    runtime: { getManifest: () => ({ version: '1.0.13' }) },
    storage: { onChanged: { addListener: vi.fn() } },
  })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function reopen(state: AuthState) {
  snapshot.mockResolvedValue(state)
  const { useAuthGate } = await import('./useAuthGate')
  const gate = useAuthGate()
  await gate.init()
  return gate
}
const pending = (): AuthState => ({
  status: 'code-sent',
  pendingEmail: 'alex@example.com',
  codeExpiresAt: Date.now() + 120_000,
  attemptsLeft: 3,
})

describe('reopening a pending sign-in', () => {
  it('returns directly to OTP with its original remaining time and attempts', async () => {
    const gate = await reopen(pending())
    expect(gate.screen.value).toBe('otp')
    expect(gate.email.value).toBe('alex@example.com')
    expect(gate.hasPendingCode.value).toBe(true)
    expect(gate.attemptsLeft.value).toBe(3)
    expect(gate.otpTimerLabel.value).toBe('2:00')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(gate.otpError.value).toBe('expired')
  })

  it('can resume from the home screen without resetting the pending sign-in', async () => {
    const gate = await reopen(pending())
    gate.showSignIn()
    gate.resumeSignIn()
    expect(gate.screen.value).toBe('otp')
    expect(gate.attemptsLeft.value).toBe(3)
    expect(gate.otpTimerLabel.value).toBe('2:00')
  })

  it('shows expired codes immediately after reopening', async () => {
    const gate = await reopen({ ...pending(), codeExpiresAt: Date.now() - 1000 })
    expect(gate.screen.value).toBe('otp')
    expect(gate.otpError.value).toBe('expired')
    expect(gate.otpExpired.value).toBe(true)
  })

  it('does not unlock a code by reopening', async () => {
    const gate = await reopen({ ...pending(), attemptsLeft: 0 })
    expect(gate.otpError.value).toBe('locked')
    expect(gate.otpExpired.value).toBe(true)
  })

  it('allows a pending code from the previous extension version without inventing a deadline', async () => {
    const gate = await reopen({ status: 'code-sent', pendingEmail: 'alex@example.com' })
    expect(gate.screen.value).toBe('otp')
    expect(gate.hasCodeDeadline.value).toBe(false)
    expect(gate.otpExpired.value).toBe(false)
  })

  it('uses the persisted attempt count after a wrong code', async () => {
    const gate = await reopen(pending())
    verify.mockResolvedValue({
      ok: false,
      error: 'invalid-code',
      state: { ...pending(), attemptsLeft: 2 },
    })
    await gate.verify('000000')
    expect(gate.screen.value).toBe('otp')
    expect(gate.attemptsLeft.value).toBe(2)
    expect(gate.otpError.value).toBe('wrong')
  })
})
