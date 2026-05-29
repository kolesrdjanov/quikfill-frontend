import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiSuggestion, FieldSummary } from '@quikfill/schemas'
import {
  AI_CLASSIFY,
  isAiClassifyRequest,
  onAiClassifyRequest,
  requestAiClassify,
} from './ai-messaging'

const summaries: FieldSummary[] = [{ fieldId: 'f1', inputType: 'text', label: 'First name' }]
const suggestions: AiSuggestion[] = [
  { fieldId: 'f1', semanticType: 'person.firstName', confidence: 0.9, reasons: [] },
]

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

  it('fails gracefully when the background errors', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    const response = await requestAiClassify(summaries)
    expect(response.ok).toBe(false)
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

  it('responds with ok:false when the handler throws', async () => {
    const { listeners } = installChrome()
    onAiClassifyRequest(vi.fn().mockRejectedValue(new Error('AI unavailable')))
    const sendResponse = vi.fn()
    listeners[0]({ type: AI_CLASSIFY, summaries }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'AI unavailable' })
  })

  it('ignores unrelated messages', () => {
    const { listeners } = installChrome()
    onAiClassifyRequest(vi.fn())
    expect(listeners[0]({ type: 'NOPE' }, {}, vi.fn())).toBeUndefined()
  })
})
