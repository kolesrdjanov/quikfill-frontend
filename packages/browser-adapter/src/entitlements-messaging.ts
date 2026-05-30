/// <reference types="chrome" />
import type { Entitlements } from '@quikfill/schemas'

/**
 * Surface → background entitlements messages. The api-client (and the token it
 * needs) live only in the background worker, so the side panel / popup read the
 * plan + usage through these messages. Modeled on `auth-messaging` /
 * `entity-data-messaging`; the helpers never throw — an unreachable background
 * resolves to `null` (treated as "unknown ⇒ don't gate").
 */
export const ENTITLEMENTS_REQUEST = 'ENTITLEMENTS_REQUEST'

export type EntitlementsRequestMessage =
  | { type: typeof ENTITLEMENTS_REQUEST; action: 'get' }
  | { type: typeof ENTITLEMENTS_REQUEST; action: 'refresh' }

export function isEntitlementsRequest(message: unknown): message is EntitlementsRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === ENTITLEMENTS_REQUEST
  )
}

async function send(message: EntitlementsRequestMessage): Promise<Entitlements | null> {
  try {
    return ((await chrome.runtime.sendMessage(message)) as Entitlements | null) ?? null
  } catch {
    return null
  }
}

/** Read the last-known entitlements snapshot from the background (`null` if unknown). */
export async function requestEntitlements(): Promise<Entitlements | null> {
  return send({ type: ENTITLEMENTS_REQUEST, action: 'get' })
}

/** Force the background to re-fetch entitlements from the API (e.g. after a 429). */
export async function refreshEntitlements(): Promise<Entitlements | null> {
  return send({ type: ENTITLEMENTS_REQUEST, action: 'refresh' })
}

/** The background-side implementations the registrar dispatches to. */
export interface EntitlementsHandlers {
  get(): Entitlements | null | Promise<Entitlements | null>
  refresh(): Entitlements | null | Promise<Entitlements | null>
}

/**
 * Register the background handler for entitlements requests. Returns `true` to
 * keep the channel open for the async `sendResponse`; a thrown handler resolves
 * to `null` rather than crashing the worker. Returns `undefined` for unrelated
 * messages so other listeners can handle them.
 */
export function onEntitlementsRequest(handlers: EntitlementsHandlers): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isEntitlementsRequest(message)) return undefined
    const run = async (): Promise<Entitlements | null> => {
      switch (message.action) {
        case 'get':
          return handlers.get()
        case 'refresh':
          return handlers.refresh()
      }
    }
    run()
      .then((response) => sendResponse(response))
      .catch(() => sendResponse(null))
    return true
  })
}
