import type { StorageAdapter } from '@quikfill/schemas'

/**
 * A `StorageAdapter` backed by `figma.clientStorage`, the mirror of
 * `browser-adapter/createChromeStorageAdapter`.
 *
 * Note: `figma.clientStorage` structured-clones values — it is **not** string-only
 * (that is `node.setPluginData`). So, like the chrome adapter, we store live values
 * with no JSON (de)serialization; callers get objects back unchanged. The only
 * deviation is `list()`: clientStorage has no bulk `get(null)`, so it filters
 * `keysAsync()`. Runs in the **sandbox** realm (`clientStorage` is on `figma`); the
 * iframe reaches it over the bridge.
 */
export function createFigmaClientStorageAdapter(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const value = await figma.clientStorage.getAsync(key)
      return (value as T | undefined) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await figma.clientStorage.setAsync(key, value)
    },
    async delete(key: string): Promise<void> {
      await figma.clientStorage.deleteAsync(key)
    },
    async list(prefix: string): Promise<string[]> {
      const keys = await figma.clientStorage.keysAsync()
      return keys.filter((key) => key.startsWith(prefix))
    },
  }
}
