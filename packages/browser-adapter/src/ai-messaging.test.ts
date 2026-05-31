import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiFillRequest, AiFillResponse, AiSuggestion, FieldSummary } from '@quikfill/schemas'
import {
  AI_CLASSIFY,
  AI_FILL,
  aiClassifyReason,
  isAiClassifyRequest,
  isAiFillRequest,
  onAiClassifyRequest,
  onAiFillRequest,
  requestAiClassify,
  requestAiFill,
} from './ai-messaging'

const summaries: FieldSummary[] = [{ fieldId: 'f1', inputType: 'text', label: 'First name' }]
const suggestions: AiSuggestion[] = [
  { fieldId: 'f1', semanticType: 'person.firstName', confidence: 0.9, reasons: [] },
]
const fillRequest: AiFillRequest = {
  page: { lang: 'en', title: 'Sign up', description: '' },
  fields: [{ fieldId: 'qf-0', inputType: 'email', label: 'Email', required: true }],
}
const fillResponse: AiFillResponse = { values: [{ fieldId: 'qf-0', value: 'jane@example.com' }] }

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

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
  vi.restoreAllMocks()
})

describe('isAiClassifyRequest', () => {
  it('accepts a well-formed classify request', () => {
    expect(isAiClassifyRequest({ type: AI_CLASSIFY, summaries })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isAiClassifyRequest({ type: 'OTHER' })).toBe(false)
    expect(isAiClassifyRequest(null)).toBe(false)
  })
})

describe('requestAiClassify', () => {
  it('sends a runtime message to the background and returns its response', async () => {
    const { runtime } = installChrome(vi.fn().mockResolvedValue({ ok: true, suggestions }))
    const response = await requestAiClassify(summaries)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: AI_CLASSIFY, summaries })
    expect(response).toEqual({ ok: true, suggestions })
  })

  it('reports an offline cause when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    const response = await requestAiClassify(summaries)
    expect(response).toEqual({ ok: false, reason: 'offline' })
  })
})

describe('aiClassifyReason', () => {
  it('maps a 503 / SERVICE_UNAVAILABLE to "not-configured"', () => {
    expect(
      aiClassifyReason({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'AI is not configured',
      }),
    ).toEqual({
      reason: 'not-configured',
      message: 'AI is not configured',
    })
  })
  it('maps QUOTA_EXCEEDED (429) to "quota"', () => {
    expect(aiClassifyReason({ status: 429, code: 'QUOTA_EXCEEDED' }).reason).toBe('quota')
  })
  it('maps a bare 429 (throttle) to "rate-limited"', () => {
    expect(aiClassifyReason({ status: 429, code: 'HTTP_ERROR' }).reason).toBe('rate-limited')
  })
  it('maps a 401 to "auth"', () => {
    expect(aiClassifyReason({ status: 401 }).reason).toBe('auth')
  })
  it('maps a statusless error (network) to "offline"', () => {
    expect(aiClassifyReason(new Error('Failed to fetch')).reason).toBe('offline')
  })
  it('maps anything else to "error"', () => {
    expect(aiClassifyReason({ status: 500, code: 'INTERNAL_SERVER_ERROR' }).reason).toBe('error')
  })
})

describe('onAiClassifyRequest', () => {
  it('invokes the handler and responds with suggestions', async () => {
    const { listeners } = installChrome()
    onAiClassifyRequest(vi.fn().mockResolvedValue(suggestions))
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: AI_CLASSIFY, summaries }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, suggestions })
  })

  it('responds with the mapped failure cause when the handler throws', async () => {
    const { listeners } = installChrome()
    const err = Object.assign(new Error('AI is not configured'), {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    })
    onAiClassifyRequest(vi.fn().mockRejectedValue(err))
    const sendResponse = vi.fn()
    listeners[0]({ type: AI_CLASSIFY, summaries }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      reason: 'not-configured',
      message: 'AI is not configured',
    })
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onAiClassifyRequest(vi.fn())
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})

describe('isAiFillRequest', () => {
  it('accepts a well-formed fill request', () => {
    expect(isAiFillRequest({ type: AI_FILL, request: fillRequest })).toBe(true)
  })
  it('rejects other messages', () => {
    expect(isAiFillRequest({ type: AI_CLASSIFY })).toBe(false)
    expect(isAiFillRequest(null)).toBe(false)
  })
})

describe('requestAiFill', () => {
  it('sends a runtime message to the background and returns its response', async () => {
    const { runtime } = installChrome(
      vi.fn().mockResolvedValue({ ok: true, response: fillResponse }),
    )
    const result = await requestAiFill(fillRequest)
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: AI_FILL, request: fillRequest })
    expect(result).toEqual({ ok: true, response: fillResponse })
  })

  it('reports an offline cause when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestAiFill(fillRequest)).toEqual({ ok: false, reason: 'offline' })
  })
})

describe('onAiFillRequest', () => {
  it('invokes the handler and responds with fill values', async () => {
    const { listeners } = installChrome()
    onAiFillRequest(vi.fn().mockResolvedValue(fillResponse))
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: AI_FILL, request: fillRequest }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, response: fillResponse })
  })

  it('responds with the mapped failure cause when the handler throws', async () => {
    const { listeners } = installChrome()
    const err = Object.assign(new Error('quota'), { status: 429, code: 'QUOTA_EXCEEDED' })
    onAiFillRequest(vi.fn().mockRejectedValue(err))
    const sendResponse = vi.fn()
    listeners[0]({ type: AI_FILL, request: fillRequest }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'quota', message: 'quota' })
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onAiFillRequest(vi.fn())
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
