import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, extensionSettingsSchema } from './extension-settings'

describe('DEFAULT_EXTENSION_SETTINGS', () => {
  it('is enabled by default and parses against the schema', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.globalEnabled).toBe(true)
    expect(() => extensionSettingsSchema.parse(DEFAULT_EXTENSION_SETTINGS)).not.toThrow()
  })
})
