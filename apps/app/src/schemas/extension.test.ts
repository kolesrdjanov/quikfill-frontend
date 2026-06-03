import { describe, expect, it } from 'vitest'
import { buildDownloadHref, extensionManifestSchema } from './extension'

describe('extensionManifestSchema', () => {
  it('parses a well-formed manifest', () => {
    const parsed = extensionManifestSchema.parse({
      version: '1.0.3',
      filename: 'quikfill-extension.zip',
      builtAt: '2026-06-03T12:00:00.000Z',
    })
    expect(parsed.version).toBe('1.0.3')
    expect(parsed.filename).toBe('quikfill-extension.zip')
  })

  it('rejects a manifest missing fields', () => {
    expect(() => extensionManifestSchema.parse({ version: '1.0.3' })).toThrow()
  })
})

describe('buildDownloadHref', () => {
  it('cache-busts with the version when a manifest is present', () => {
    const href = buildDownloadHref({
      version: '1.0.3',
      filename: 'quikfill-extension.zip',
      builtAt: '2026-06-03T12:00:00.000Z',
    })
    expect(href).toBe('/quikfill-extension.zip?v=1.0.3')
  })

  it('falls back to the fixed URL when the manifest is null', () => {
    expect(buildDownloadHref(null)).toBe('/quikfill-extension.zip')
  })
})
