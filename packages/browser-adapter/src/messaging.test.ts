import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScanResult } from '@quikfill/schemas'
import {
  getActiveTabId,
  isScanRequest,
  onScanRequest,
  requestScan,
  SCAN_REQUEST,
} from './messaging'

const RESULT: ScanResult = { fields: [], limitations: [] }

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined

function installChrome() {
  const listeners: Listener[] = []
  const tabs = {
    query: vi.fn().mockResolvedValue([{ id: 7 }]),
    sendMessage: vi.fn().mockResolvedValue(RESULT),
  }
  const runtime = {
    onMessage: { addListener: vi.fn((l: Listener) => listeners.push(l)) },
  }
  ;(globalThis as { chrome?: unknown }).chrome = { tabs, runtime }
  return { listeners, tabs, runtime }
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
  vi.restoreAllMocks()
})

describe('isScanRequest', () => {
  it('accepts a well-formed scan request', () => {
    expect(isScanRequest({ type: SCAN_REQUEST })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isScanRequest({ type: 'OTHER' })).toBe(false)
    expect(isScanRequest(null)).toBe(false)
    expect(isScanRequest('SCAN_REQUEST')).toBe(false)
  })
})

describe('requestScan + getActiveTabId', () => {
  it('sends a typed message to the tab and returns its result', async () => {
    const { tabs } = installChrome()
    const result = await requestScan(7, { includeHidden: true })
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: SCAN_REQUEST,
      options: { includeHidden: true },
    })
    expect(result).toBe(RESULT)
  })

  it('reads the active tab id', async () => {
    installChrome()
    expect(await getActiveTabId()).toBe(7)
  })
})

describe('onScanRequest', () => {
  it('invokes the handler and responds asynchronously', async () => {
    const { listeners } = installChrome()
    const handler = vi.fn().mockResolvedValue(RESULT)
    onScanRequest(handler)
    expect(listeners).toHaveLength(1)

    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: SCAN_REQUEST, options: undefined }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).toHaveBeenCalledWith(undefined)
    expect(sendResponse).toHaveBeenCalledWith(RESULT)
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    const handler = vi.fn()
    onScanRequest(handler)
    const result = listeners[0]({ type: 'NOPE' }, {}, vi.fn())
    expect(result).toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })
})
