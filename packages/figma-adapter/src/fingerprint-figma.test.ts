import { describe, expect, it } from 'vitest'
import { figmaFingerprint, figmaStructureHash, fnv1aHex } from './fingerprint-figma'

describe('fnv1aHex', () => {
  it('is a deterministic 8-char hex', () => {
    expect(fnv1aHex('abc')).toBe(fnv1aHex('abc'))
    expect(fnv1aHex('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1aHex('abc')).not.toBe(fnv1aHex('abd'))
  })
})

describe('figmaFingerprint', () => {
  const base = { framePath: ['Sign up', 'Form'], layerName: 'Email', nodeKind: 'TEXT' }

  it('is stable across calls with the same identity', () => {
    expect(figmaFingerprint(base)).toBe(figmaFingerprint({ ...base }))
  })
  it('changes when the layer name changes', () => {
    expect(figmaFingerprint(base)).not.toBe(figmaFingerprint({ ...base, layerName: 'Phone' }))
  })
  it('changes when the frame path changes', () => {
    expect(figmaFingerprint(base)).not.toBe(
      figmaFingerprint({ ...base, framePath: ['Login', 'Form'] }),
    )
  })
  it('is case-insensitive on names', () => {
    expect(figmaFingerprint(base)).toBe(figmaFingerprint({ ...base, layerName: 'email' }))
  })
})

describe('figmaStructureHash', () => {
  it('uses the verbatim form-scanner signature format', () => {
    const fields = [
      { inputType: 'text', labelText: 'Email' },
      { inputType: 'text', labelText: 'Name' },
    ]
    expect(figmaStructureHash(fields)).toBe(fnv1aHex('text:email|text:name'))
  })
  it('changes when a field is added', () => {
    const a = [{ inputType: 'text', labelText: 'Email' }]
    const b = [...a, { inputType: 'text', labelText: 'Name' }]
    expect(figmaStructureHash(a)).not.toBe(figmaStructureHash(b))
  })
})
