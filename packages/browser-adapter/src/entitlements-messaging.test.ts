import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entitlements } from '@quikfill/schemas'
import {
  ENTITLEMENTS_REQUEST,
  isEntitlementsRequest,
  onEntitlementsRequest,
  refreshEntitlements,
  requestEntitlements,
} from './entitlements-messaging'

const ENT: Entitlements = {
  planKey: 'pro',
  displayName: 'Pro Tester',
  status: 'active',
  tokensUsed: 5,
  tokenLimit: 2_000_000,
}

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined

function installChrome(sendMessage = vi.fn()) {
  const listeners: Listener[] = []
  ;(globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage, onMessage: { addListener: vi.fn((l: Listener) => listeners.push(l)) } },
  }
  return { listeners, sendMessage }
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
  vi.restoreAllMocks()
})

describe('isEntitlementsRequest', () => {
  it('accepts a well-formed request', () => {
    expect(isEntitlementsRequest({ type: ENTITLEMENTS_REQUEST, action: 'get' })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isEntitlementsRequest({ type: 'OTHER' })).toBe(false)
    expect(isEntitlementsRequest(null)).toBe(false)
  })
})

describe('surface helpers', () => {
  it('requestEntitlements returns the background snapshot', async () => {
    const { sendMessage } = installChrome(vi.fn().mockResolvedValue(ENT))
    expect(await requestEntitlements()).toEqual(ENT)
    expect(sendMessage).toHaveBeenCalledWith({ type: ENTITLEMENTS_REQUEST, action: 'get' })
  })

  it('requestEntitlements resolves to null when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestEntitlements()).toBeNull()
  })

  it('refreshEntitlements asks for a fresh fetch', async () => {
    const { sendMessage } = installChrome(vi.fn().mockResolvedValue(ENT))
    expect(await refreshEntitlements()).toEqual(ENT)
    expect(sendMessage).toHaveBeenCalledWith({ type: ENTITLEMENTS_REQUEST, action: 'refresh' })
  })
})

describe('onEntitlementsRequest', () => {
  it('dispatches get and keeps the channel open', async () => {
    const { listeners } = installChrome()
    onEntitlementsRequest({
      get: vi.fn().mockResolvedValue(ENT),
      refresh: vi.fn().mockResolvedValue(ENT),
    })
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: ENTITLEMENTS_REQUEST, action: 'get' }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith(ENT)
  })

  it('responds null when a handler throws', async () => {
    const { listeners } = installChrome()
    onEntitlementsRequest({
      get: vi.fn().mockRejectedValue(new Error('boom')),
      refresh: vi.fn(),
    })
    const sendResponse = vi.fn()
    listeners[0]({ type: ENTITLEMENTS_REQUEST, action: 'get' }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith(null)
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onEntitlementsRequest({ get: vi.fn(), refresh: vi.fn() })
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
