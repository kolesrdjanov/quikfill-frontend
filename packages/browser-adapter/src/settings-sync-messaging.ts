/// <reference types="chrome" />
import type { ExtensionSettings } from '@quikfill/schemas'

/**
 * Surface → background "pull my dashboard settings now" message. The api-client
 * (and the token it needs) live only in the background worker, so the popup can't
 * fetch `GET /users/me` itself — it asks the background to re-pull the
 * dashboard-managed settings into `chrome.storage.local`. Modeled on
 * `entitlements-messaging`; the helper never throws — an unreachable / signed-out
 * background resolves to `null` and the caller keeps the last-synced values.
 *
 * This closes the gap where settings were only ever hydrated on a sign-in
 * transition, so a later dashboard change never reached an already-signed-in
 * extension until the service worker happened to recycle.
 */
export const SETTINGS_SYNC_REQUEST = 'SETTINGS_SYNC_REQUEST'

export interface SettingsSyncRequestMessage {
  type: typeof SETTINGS_SYNC_REQUEST
}

export function isSettingsSyncRequest(message: unknown): message is SettingsSyncRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === SETTINGS_SYNC_REQUEST
  )
}

/**
 * Ask the background to re-pull the dashboard settings into storage. Resolves
 * with the freshly-synced settings, or `null` if the background is unreachable /
 * signed out (the cached settings in storage are left untouched in that case).
 */
export async function requestSettingsSync(): Promise<ExtensionSettings | null> {
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: SETTINGS_SYNC_REQUEST,
    } satisfies SettingsSyncRequestMessage)) as ExtensionSettings | null
    return reply ?? null
  } catch {
    return null
  }
}

/**
 * Register the background handler for settings-sync requests. Returns `true` to
 * keep the channel open for the async `sendResponse`; a thrown handler resolves
 * to `null` rather than crashing the worker. Returns `undefined` for unrelated
 * messages so other listeners can handle them.
 */
export function onSettingsSyncRequest(
  handler: () => ExtensionSettings | null | Promise<ExtensionSettings | null>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isSettingsSyncRequest(message)) return undefined
    Promise.resolve(handler())
      .then((settings) => sendResponse(settings ?? null))
      .catch(() => sendResponse(null))
    return true
  })
}
