import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, type ExtensionSettings } from '@quikfill/schemas'
import {
  SETTINGS_SYNC_REQUEST,
  isSettingsSyncRequest,
  onSettingsSyncRequest,
  requestSettingsSync,
} from './settings-sync-messaging'

const SETTINGS: ExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS, theme: 'dark' }

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

describe('isSettingsSyncRequest', () => {
  it('accepts a well-formed request', () => {
    expect(isSettingsSyncRequest({ type: SETTINGS_SYNC_REQUEST })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isSettingsSyncRequest({ type: 'OTHER' })).toBe(false)
    expect(isSettingsSyncRequest(null)).toBe(false)
  })
})

describe('requestSettingsSync', () => {
  it('returns the freshly-synced settings from the background', async () => {
    const { sendMessage } = installChrome(vi.fn().mockResolvedValue(SETTINGS))
    expect(await requestSettingsSync()).toEqual(SETTINGS)
    expect(sendMessage).toHaveBeenCalledWith({ type: SETTINGS_SYNC_REQUEST })
  })
  it('resolves to null when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestSettingsSync()).toBeNull()
  })
  it('resolves to null when the background returns nothing', async () => {
    installChrome(vi.fn().mockResolvedValue(undefined))
    expect(await requestSettingsSync()).toBeNull()
  })
})

describe('onSettingsSyncRequest', () => {
  it('dispatches the handler and keeps the channel open', async () => {
    const { listeners } = installChrome()
    onSettingsSyncRequest(vi.fn().mockResolvedValue(SETTINGS))
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: SETTINGS_SYNC_REQUEST }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith(SETTINGS)
  })
  it('responds null when the handler throws', async () => {
    const { listeners } = installChrome()
    onSettingsSyncRequest(vi.fn().mockRejectedValue(new Error('boom')))
    const sendResponse = vi.fn()
    listeners[0]({ type: SETTINGS_SYNC_REQUEST }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith(null)
  })
  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onSettingsSyncRequest(vi.fn())
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
