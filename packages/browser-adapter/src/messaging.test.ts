import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FillInstruction, ScanResult, UndoSnapshot } from '@quikfill/schemas'
import {
  FILL_REQUEST,
  getActiveTabId,
  isFillRequest,
  isScanRequest,
  isUndoRequest,
  onScanRequest,
  requestFill,
  requestScan,
  requestUndo,
  SCAN_REQUEST,
  UNDO_REQUEST,
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

describe('fill + undo guards and requests', () => {
  const instruction: FillInstruction = {
    detectedFieldId: 'a',
    selectorCandidates: ['#a'],
    frame: 'main',
    shadow: false,
    tagName: 'input',
    inputType: 'text',
    fillStrategy: 'nativeInput',
    proposedValue: 'x',
  }
  const snapshot: UndoSnapshot = { entries: [] }

  it('discriminates message types', () => {
    expect(isFillRequest({ type: FILL_REQUEST })).toBe(true)
    expect(isUndoRequest({ type: UNDO_REQUEST })).toBe(true)
    expect(isFillRequest({ type: UNDO_REQUEST })).toBe(false)
  })

  it('requestFill sends instructions to the tab', async () => {
    const { tabs } = installChrome()
    await requestFill(7, [instruction])
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: FILL_REQUEST,
      instructions: [instruction],
    })
  })

  it('requestUndo sends the snapshot to the tab', async () => {
    const { tabs } = installChrome()
    await requestUndo(7, snapshot)
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, { type: UNDO_REQUEST, snapshot })
  })
})
