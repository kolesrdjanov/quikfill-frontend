/// <reference types="chrome" />
import {
  DEFAULT_EXTENSION_SETTINGS,
  extensionSettingsSchema,
  type ExtensionSettings,
} from '@quikfill/schemas'

/**
 * Dashboard-managed extension settings, cached in `chrome.storage.local` under
 * the same key the in-app `useSettings` composable reads (`settings:extension`).
 * The background worker is the only writer — it hydrates the blob from
 * `GET /users/me` on sign-in/refresh — so the dashboard is the source of truth
 * and every surface (popup, side panel, content overlay) reads + reacts here.
 *
 * Keeps the `chrome.storage` dependency inside the adapter, per the layering
 * rule, and stays Vue-free so the content script can use it without bundling Vue.
 */
const SETTINGS_KEY = 'settings:extension'

/** Parse untrusted storage into a complete settings object (mirrors `useSettings`). */
function coerce(raw: unknown): ExtensionSettings {
  const parsed = extensionSettingsSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  // A partial/older payload: layer it over the defaults, then re-validate so the
  // result always settles to a valid, full shape.
  const merged = { ...DEFAULT_EXTENSION_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) }
  return extensionSettingsSchema.catch(DEFAULT_EXTENSION_SETTINGS).parse(merged)
}

/** Read the current settings, falling back to defaults when nothing is stored yet. */
export async function readExtensionSettings(
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<ExtensionSettings> {
  const result = await area.get(SETTINGS_KEY)
  return coerce(result[SETTINGS_KEY])
}

/** Persist the full settings object (background-only writer). */
export async function writeExtensionSettings(
  settings: ExtensionSettings,
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<void> {
  await area.set({ [SETTINGS_KEY]: settings })
}

/**
 * Subscribe to settings changes so any reader reacts live to a dashboard save
 * (synced down by the background). Returns an unsubscribe function.
 */
export function onExtensionSettingsChange(
  callback: (settings: ExtensionSettings) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local') return
    const change = changes[SETTINGS_KEY]
    if (change) callback(coerce(change.newValue))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** The storage key surfaces watch via `chrome.storage.onChanged`. */
export const EXTENSION_SETTINGS_KEY = SETTINGS_KEY
