import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@quikfill/schemas'
import {
  AUTH_REQUEST,
  isAuthRequest,
  logoutAuth,
  onAuthRequest,
  requestAuthCode,
  requestAuthState,
  verifyAuthCode,
} from './auth-messaging'

const signedIn: AuthState = {
  status: 'signed-in',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com' },
}

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined

function installChrome(sendMessage = vi.fn()) {
  const listeners: Listener[] = []
  const runtime = {
    sendMessage,
    onMessage: { addListener: vi.fn((l: Listener) => listeners.push(l)) },
  }
  ;(globalThis as { chrome?: unknown }).chrome = { runtime }
  return { listeners, runtime }
}

/** Build the handler set with all four actions stubbed unless overridden. */
function handlers(overrides = {}) {
  return {
    getState: vi.fn().mockResolvedValue(signedIn),
    requestCode: vi.fn().mockResolvedValue({ ok: true }),
    verify: vi.fn().mockResolvedValue({ ok: true, state: signedIn }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
  vi.restoreAllMocks()
})

describe('isAuthRequest', () => {
  it('accepts a well-formed auth request', () => {
    expect(isAuthRequest({ type: AUTH_REQUEST, action: 'get-state' })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isAuthRequest({ type: 'OTHER' })).toBe(false)
    expect(isAuthRequest(null)).toBe(false)
  })
})

describe('surface helpers', () => {
  it('requestAuthState returns the background snapshot', async () => {
    const { runtime } = installChrome(vi.fn().mockResolvedValue(signedIn))
    const state = await requestAuthState()
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: AUTH_REQUEST, action: 'get-state' })
    expect(state).toEqual(signedIn)
  })

  it('requestAuthState resolves to a network error when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestAuthState()).toEqual({ status: 'error', error: 'network' })
  })

  it('requestAuthCode forwards the email and returns the result', async () => {
    const { runtime } = installChrome(vi.fn().mockResolvedValue({ ok: true, devCode: '123456' }))
    const result = await requestAuthCode('a@b.com')
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      type: AUTH_REQUEST,
      action: 'request-code',
      email: 'a@b.com',
    })
    expect(result).toEqual({ ok: true, devCode: '123456' })
  })

  it('requestAuthCode fails as network when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestAuthCode('a@b.com')).toEqual({ ok: false, error: 'network' })
  })

  it('verifyAuthCode forwards email + code and returns the new state', async () => {
    const { runtime } = installChrome(vi.fn().mockResolvedValue({ ok: true, state: signedIn }))
    const result = await verifyAuthCode('a@b.com', '123456')
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      type: AUTH_REQUEST,
      action: 'verify',
      email: 'a@b.com',
      code: '123456',
    })
    expect(result).toEqual({ ok: true, state: signedIn })
  })

  it('logoutAuth treats an unreachable background as already signed out', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await logoutAuth()).toEqual({ ok: true })
  })
})

describe('onAuthRequest', () => {
  it('dispatches get-state to the handler and keeps the channel open', async () => {
    const { listeners } = installChrome()
    const h = handlers()
    onAuthRequest(h)
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: AUTH_REQUEST, action: 'get-state' }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(h.getState).toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(signedIn)
  })

  it('dispatches verify with email + code', async () => {
    const { listeners } = installChrome()
    const h = handlers()
    onAuthRequest(h)
    const sendResponse = vi.fn()
    listeners[0](
      { type: AUTH_REQUEST, action: 'verify', email: 'a@b.com', code: '999111' },
      {},
      sendResponse,
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(h.verify).toHaveBeenCalledWith('a@b.com', '999111')
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, state: signedIn })
  })

  it('responds with a typed error when a handler throws', async () => {
    const { listeners } = installChrome()
    const h = handlers({ requestCode: vi.fn().mockRejectedValue(new Error('boom')) })
    onAuthRequest(h)
    const sendResponse = vi.fn()
    listeners[0]({ type: AUTH_REQUEST, action: 'request-code', email: 'a@b.com' }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'unknown' })
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onAuthRequest(handlers())
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
