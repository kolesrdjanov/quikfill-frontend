/// <reference types="chrome" />
import type { AiSuggestion, FieldSummary } from '@quikfill/schemas'

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

/** Background → panel reply. AI is user-initiated and may be unavailable. */
export type AiClassifyResponse =
  | { ok: true; suggestions: AiSuggestion[] }
  | { ok: false; error: string }

export function isAiClassifyRequest(message: unknown): message is AiClassifyMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === AI_CLASSIFY
  )
}

/**
 * Ask the background worker to classify the given (already redacted) summaries.
 * Never throws — a missing receiver or backend error resolves to `ok: false`.
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
    return { ok: false, error: 'AI unavailable' }
  } catch {
    return { ok: false, error: 'AI unavailable' }
  }
}

/**
 * Register the background handler for classify requests. Returning `true` keeps
 * the message channel open for the async `sendResponse`; handler failures are
 * reported as `ok: false` rather than crashing the worker.
 */
export function onAiClassifyRequest(
  handler: (summaries: FieldSummary[]) => AiSuggestion[] | Promise<AiSuggestion[]>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isAiClassifyRequest(message)) return undefined
    Promise.resolve(handler(message.summaries))
      .then((suggestions) => sendResponse({ ok: true, suggestions } satisfies AiClassifyResponse))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'AI unavailable',
        } satisfies AiClassifyResponse),
      )
    return true
  })
}
