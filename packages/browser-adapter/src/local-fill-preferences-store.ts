/// <reference types="chrome" />
import {
  DEFAULT_LOCAL_FILL_PREFERENCES,
  localFillPreferencesSchema,
  type LocalFillPreferences,
} from '@quikfill/schemas'

export const LOCAL_FILL_PREFERENCES_KEY = 'settings:local-fill'
const parse = (raw: unknown): LocalFillPreferences =>
  localFillPreferencesSchema.catch(DEFAULT_LOCAL_FILL_PREFERENCES).parse(raw)

export async function readLocalFillPreferences(
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<LocalFillPreferences> {
  return parse((await area.get(LOCAL_FILL_PREFERENCES_KEY))[LOCAL_FILL_PREFERENCES_KEY] ?? {})
}

export async function writeLocalFillPreferences(
  preferences: LocalFillPreferences,
  area: chrome.storage.StorageArea = chrome.storage.local,
): Promise<void> {
  await area.set({ [LOCAL_FILL_PREFERENCES_KEY]: localFillPreferencesSchema.parse(preferences) })
}

export function onLocalFillPreferencesChange(
  callback: (preferences: LocalFillPreferences) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === 'local' && changes[LOCAL_FILL_PREFERENCES_KEY])
      callback(parse(changes[LOCAL_FILL_PREFERENCES_KEY].newValue))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
