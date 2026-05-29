/// <reference types="chrome" />
import type { StorageAdapter } from '@quikfill/schemas'

/**
 * A StorageAdapter backed by a chrome.storage area (defaults to `local`).
 * Never use `sync` for sensitive form data. When backend sync lands, swap this
 * implementation for a sync-backed one — feature code is unchanged.
 */
export function createChromeStorageAdapter(
  area: chrome.storage.StorageArea = chrome.storage.local,
): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const result = await area.get(key)
      return (result[key] as T) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await area.set({ [key]: value })
    },
    async delete(key: string): Promise<void> {
      await area.remove(key)
    },
    async list(prefix: string): Promise<string[]> {
      const all = await area.get(null)
      return Object.keys(all).filter((key) => key.startsWith(prefix))
    },
  }
}
