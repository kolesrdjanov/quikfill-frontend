/// <reference types="chrome" />
import type { CreateFillRunInput, UpdateFillRunInput } from '@quikfill/schemas'

/**
 * Panel → background message recording a fill run. The api-client call lives in
 * the background (token + base URL never reach a content script), and the
 * background owns the create→update lifecycle so the panel makes one round-trip.
 */
export const FILL_RUN_RECORD = 'FILL_RUN_RECORD'

/** A fill run to persist: the redacted create payload + its final status/results. */
export interface FillRunRecord {
  create: CreateFillRunInput
  finish: UpdateFillRunInput
}

export interface FillRunRecordMessage {
  type: typeof FILL_RUN_RECORD
  record: FillRunRecord
}

/** Recording history is best-effort: failures are reported, never thrown. */
export type FillRunRecordResponse = { ok: true } | { ok: false; error: string }

export function isFillRunRecordRequest(message: unknown): message is FillRunRecordMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === FILL_RUN_RECORD
  )
}

/**
 * Ask the background worker to record a fill run. Never throws — a missing
 * receiver or backend error resolves to `ok: false` (history is non-essential).
 */
export async function requestFillRunRecord(record: FillRunRecord): Promise<FillRunRecordResponse> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: FILL_RUN_RECORD,
      record,
    } satisfies FillRunRecordMessage)
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as FillRunRecordResponse
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/**
 * Register the background handler. The handler typically creates the run then
 * updates it with the result; either step failing is reported as `ok: false`.
 */
export function onFillRunRecordRequest(handler: (record: FillRunRecord) => Promise<void>): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isFillRunRecordRequest(message)) return undefined
    Promise.resolve(handler(message.record))
      .then(() => sendResponse({ ok: true } satisfies FillRunRecordResponse))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'fill-run record failed',
        } satisfies FillRunRecordResponse),
      )
    return true
  })
}
