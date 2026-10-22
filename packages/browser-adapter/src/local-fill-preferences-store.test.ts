import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_FILL_PREFERENCES } from '@quikfill/schemas'
import {
  LOCAL_FILL_PREFERENCES_KEY,
  readLocalFillPreferences,
  writeLocalFillPreferences,
} from './local-fill-preferences-store'

function area() {
  const data: Record<string, unknown> = {}
  return {
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (next: Record<string, unknown>) => {
      Object.assign(data, next)
    },
  } as unknown as chrome.storage.StorageArea
}

describe('local fill preferences', () => {
  it('starts safe and upgrades an older partial value', async () => {
    const storage = area()
    expect(await readLocalFillPreferences(storage)).toEqual(DEFAULT_LOCAL_FILL_PREFERENCES)
    await storage.set({ [LOCAL_FILL_PREFERENCES_KEY]: { seed: 'qa' } })
    expect(await readLocalFillPreferences(storage)).toEqual({
      ...DEFAULT_LOCAL_FILL_PREFERENCES,
      seed: 'qa',
    })
  })
  it('persists execution preferences and rejects invalid writes', async () => {
    const storage = area()
    const prefs = { onlyEmpty: false, seed: 'qa', locale: 'sr-RS' as const }
    await writeLocalFillPreferences(prefs, storage)
    expect(await readLocalFillPreferences(storage)).toEqual(prefs)
    await expect(
      writeLocalFillPreferences({ ...prefs, seed: 'x'.repeat(129) }, storage),
    ).rejects.toThrow()
    expect(await readLocalFillPreferences(storage)).toEqual(prefs)
  })
})
