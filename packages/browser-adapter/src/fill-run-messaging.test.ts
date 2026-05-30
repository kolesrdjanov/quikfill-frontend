import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateFillRunInput, UpdateFillRunInput } from '@quikfill/schemas'
import {
  FILL_RUN_RECORD,
  isFillRunRecordRequest,
  onFillRunRecordRequest,
  requestFillRunRecord,
  type FillRunRecord,
} from './fill-run-messaging'

const record: FillRunRecord = {
  create: { url: 'https://x.test/form', mode: 'fill' } as CreateFillRunInput,
  finish: { status: 'success' } as UpdateFillRunInput,
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

describe('isFillRunRecordRequest', () => {
  it('accepts a well-formed record request and rejects others', () => {
    expect(isFillRunRecordRequest({ type: FILL_RUN_RECORD, record })).toBe(true)
    expect(isFillRunRecordRequest({ type: 'OTHER' })).toBe(false)
    expect(isFillRunRecordRequest(null)).toBe(false)
  })
})

describe('requestFillRunRecord', () => {
  it('forwards the record to the background and returns its reply', async () => {
    const { sendMessage } = installChrome(vi.fn().mockResolvedValue({ ok: true }))
    const res = await requestFillRunRecord(record)
    expect(sendMessage).toHaveBeenCalledWith({ type: FILL_RUN_RECORD, record })
    expect(res).toEqual({ ok: true })
  })

  it('fails gracefully (best-effort) when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect((await requestFillRunRecord(record)).ok).toBe(false)
  })
})

describe('onFillRunRecordRequest', () => {
  it('invokes the handler with the record and replies ok', async () => {
    const { listeners } = installChrome()
    const handler = vi.fn().mockResolvedValue(undefined)
    onFillRunRecordRequest(handler)
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: FILL_RUN_RECORD, record }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(handler).toHaveBeenCalledWith(record)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })

  it('replies ok:false when the handler throws, and ignores unrelated messages', async () => {
    const { listeners } = installChrome()
    onFillRunRecordRequest(vi.fn().mockRejectedValue(new Error('boom')))
    const sendResponse = vi.fn()
    listeners[0]({ type: FILL_RUN_RECORD, record }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'boom' })
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
