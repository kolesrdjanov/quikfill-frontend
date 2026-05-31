/// <reference types="chrome" />
import type { AiFillRequest, AiFillResponse, AiSuggestion, FieldSummary } from '@quikfill/schemas'

/**
 * Panel → background message asking the background worker to classify fields via
 * the backend. The api-client call lives in the background so no token or base
 * URL ever sits in a content script.
 */
export const AI_CLASSIFY = 'AI_CLASSIFY'

export interface AiClassifyMessage {
  type: typeof AI_CLASSIFY
  summaries: FieldSummary[]
}

/**
 * Coarse, machine-readable cause of an AI failure so the panel can show an
 * actionable message instead of one opaque "AI unavailable". Mapped from the
 * backend's HTTP status + error code.
 */
export type AiClassifyReason =
  | 'not-configured' // backend has no Gemini key (503 / SERVICE_UNAVAILABLE)
  | 'quota' // monthly AI limit reached (429 / QUOTA_EXCEEDED)
  | 'rate-limited' // too many requests in a short window (bare 429)
  | 'auth' // session expired / unauthorized (401)
  | 'offline' // background worker or backend unreachable (no HTTP status)
  | 'error' // anything else

/** Background → panel reply. AI is user-initiated and may be unavailable. */
export type AiClassifyResponse =
  | { ok: true; suggestions: AiSuggestion[] }
  | { ok: false; reason: AiClassifyReason; message?: string }

/** Map a thrown api-client error (duck-typed `status`/`code`) to a coarse cause. */
export function aiClassifyReason(error: unknown): { reason: AiClassifyReason; message?: string } {
  const e = (error ?? {}) as { status?: number; code?: string; message?: unknown }
  const message = typeof e.message === 'string' ? e.message : undefined
  if (e.code === 'SERVICE_UNAVAILABLE' || e.status === 503)
    return { reason: 'not-configured', message }
  if (e.code === 'QUOTA_EXCEEDED') return { reason: 'quota', message }
  if (e.status === 429) return { reason: 'rate-limited', message }
  if (e.status === 401) return { reason: 'auth', message }
  if (e.status === undefined) return { reason: 'offline', message }
  return { reason: 'error', message }
}

export function isAiClassifyRequest(message: unknown): message is AiClassifyMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === AI_CLASSIFY
  )
}

/**
 * Ask the background worker to classify the given (already redacted) summaries.
 * Never throws — a missing receiver resolves to an `offline` failure; the
 * background forwards the backend's mapped cause for everything else.
 */
export async function requestAiClassify(summaries: FieldSummary[]): Promise<AiClassifyResponse> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: AI_CLASSIFY,
      summaries,
    } satisfies AiClassifyMessage)
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as AiClassifyResponse
    }
    return { ok: false, reason: 'error' }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

/**
 * Register the background handler for classify requests. Returning `true` keeps
 * the message channel open for the async `sendResponse`; a handler failure is
 * mapped to its cause (see {@link aiClassifyReason}) rather than crashing the worker.
 */
export function onAiClassifyRequest(
  handler: (summaries: FieldSummary[]) => AiSuggestion[] | Promise<AiSuggestion[]>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isAiClassifyRequest(message)) return undefined
    Promise.resolve(handler(message.summaries))
      .then((suggestions) => sendResponse({ ok: true, suggestions } satisfies AiClassifyResponse))
      .catch((error: unknown) =>
        sendResponse({ ok: false, ...aiClassifyReason(error) } satisfies AiClassifyResponse),
      )
    return true
  })
}

/**
 * Content → background message asking the background worker to fill a form's
 * fields via the backend `/ai/fill`. The api-client call lives in the background
 * so no token or base URL is ever exposed to a content script. The request is
 * already redacted (no values, no HTML) by the overlay's request builder.
 */
export const AI_FILL = 'AI_FILL'

export interface AiFillMessage {
  type: typeof AI_FILL
  request: AiFillRequest
}

/** Background → content reply. Reuses the coarse AI cause taxonomy. */
export type AiFillResult =
  | { ok: true; response: AiFillResponse }
  | { ok: false; reason: AiClassifyReason; message?: string }

export function isAiFillRequest(message: unknown): message is AiFillMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === AI_FILL
  )
}

/**
 * Ask the background worker to fill the given (already redacted) request. Never
 * throws — a missing receiver resolves to an `offline` failure; the background
 * forwards the backend's mapped cause (quota / rate-limit / auth / …) otherwise.
 */
export async function requestAiFill(request: AiFillRequest): Promise<AiFillResult> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: AI_FILL,
      request,
    } satisfies AiFillMessage)
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as AiFillResult
    }
    return { ok: false, reason: 'error' }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

/**
 * Register the background handler for fill requests. Returning `true` keeps the
 * message channel open for the async `sendResponse`; a handler failure is mapped
 * to its cause (see {@link aiClassifyReason}) rather than crashing the worker.
 */
export function onAiFillRequest(
  handler: (request: AiFillRequest) => AiFillResponse | Promise<AiFillResponse>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isAiFillRequest(message)) return undefined
    Promise.resolve(handler(message.request))
      .then((response) => sendResponse({ ok: true, response } satisfies AiFillResult))
      .catch((error: unknown) =>
        sendResponse({ ok: false, ...aiClassifyReason(error) } satisfies AiFillResult),
      )
    return true
  })
}
