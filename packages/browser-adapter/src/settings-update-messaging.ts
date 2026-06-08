/// <reference types="chrome" />
import type { ExtensionSettings } from '@quikfill/schemas'

/**
 * Surface → background "save these settings" message. The api-client (and its
 * auth token) live only in the background worker, so a surface that edits settings
 * — e.g. the popup's per-site activation toggle — sends the full settings object
 * here; the background PUTs it to the account (`PATCH /users/me/settings`) and
 * writes the echo into `chrome.storage.local`, which every surface + the overlay
 * watch via `storage.onChanged`. This is the WRITE counterpart to the read-only
 * `settings-sync-messaging` pull. The helper never throws — an unreachable /
 * signed-out background resolves to `null`.
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
 * Persist a full settings object to the account. Resolves with the saved settings
 * (the server's echo) or `null` if the background is unreachable / signed out.
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
