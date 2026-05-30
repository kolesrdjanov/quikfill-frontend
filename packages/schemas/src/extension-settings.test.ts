import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, allowsSampleData } from './extension-settings'

describe('DEFAULT_EXTENSION_SETTINGS', () => {
  it('defaults to hybrid so ordinary fields get values out of the box', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.defaultFillSource).toBe('hybrid')
    expect(allowsSampleData(DEFAULT_EXTENSION_SETTINGS.defaultFillSource)).toBe(true)
  })
})
