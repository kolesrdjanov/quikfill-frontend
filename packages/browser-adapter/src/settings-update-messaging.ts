/// <reference types="chrome" />
import type { ExtensionSettings } from '@quikfill/schemas'

/**
 * Surface → background local-first activation/appearance write. The background
 * persists locally and queues best-effort account sync; auth/network failures do
 * not roll back a successful device write. Local storage/background failure
 * resolves null. Tokens and account API calls remain in the worker.
 */
export const SETTINGS_UPDATE_REQUEST = 'SETTINGS_UPDATE_REQUEST'

export interface SettingsUpdateRequestMessage {
  type: typeof SETTINGS_UPDATE_REQUEST
  settings: ExtensionSettings
}

export function isSettingsUpdateRequest(message: unknown): message is SettingsUpdateRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === SETTINGS_UPDATE_REQUEST
  )
}

/**
 * Persist settings locally. Returns the saved settings or null when the local
 * write/background fails. Signed-out and offline writes are supported.
 */
export async function requestSettingsUpdate(
  settings: ExtensionSettings,
): Promise<ExtensionSettings | null> {
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: SETTINGS_UPDATE_REQUEST,
      settings,
    } satisfies SettingsUpdateRequestMessage)) as ExtensionSettings | null
    return reply ?? null
  } catch {
    return null
  }
}

/**
 * Register the background handler for settings-update requests. Returns `true` to
 * keep the channel open for the async `sendResponse`; a thrown handler resolves to
 * `null` rather than crashing the worker. Returns `undefined` for unrelated
 * messages so other listeners can handle them.
 */
export function onSettingsUpdateRequest(
  handler: (
    settings: ExtensionSettings,
  ) => ExtensionSettings | null | Promise<ExtensionSettings | null>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isSettingsUpdateRequest(message)) return undefined
    Promise.resolve(handler(message.settings))
      .then((settings) => sendResponse(settings ?? null))
      .catch(() => sendResponse(null))
    return true
  })
}
