/// <reference types="chrome" />
import type { EntityRecord, EntityType } from '@quikfill/schemas'

/**
 * Surface → background read of the user's saved entity data (types + records).
 * Like auth/ai, the api-client lives only in the background worker, so the
 * sidepanel asks for a snapshot through this message to power `recordField`
 * fills from saved data. Read-only; the helper never throws.
 */
export const ENTITY_DATA_REQUEST = 'ENTITY_DATA_REQUEST'

export type EntityDataMessage = { type: typeof ENTITY_DATA_REQUEST }

/** Background → surface reply. `ok: false` means the backend was unreachable. */
export type EntityDataResponse =
  | { ok: true; types: EntityType[]; records: EntityRecord[] }
  | { ok: false }

/** The background-side fetch the registrar dispatches to. */
export type EntityDataHandler = () => Promise<{ types: EntityType[]; records: EntityRecord[] }>

export function isEntityDataRequest(message: unknown): message is EntityDataMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === ENTITY_DATA_REQUEST
  )
}

/** Fetch the saved entity-data snapshot from the background. Unreachable ⇒ `ok: false`. */
export async function requestEntityData(): Promise<EntityDataResponse> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: ENTITY_DATA_REQUEST,
    } satisfies EntityDataMessage)
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as EntityDataResponse
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

/** Register the background handler. Returns `true` to keep the channel open. */
export function onEntityDataRequest(handler: EntityDataHandler): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isEntityDataRequest(message)) return undefined
    handler()
      .then(({ types, records }) => sendResponse({ ok: true, types, records }))
      .catch(() => sendResponse({ ok: false }))
    return true
  })
}
