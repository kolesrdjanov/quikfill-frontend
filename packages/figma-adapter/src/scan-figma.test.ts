import { afterEach, describe, expect, it } from 'vitest'
import { detectedFieldSchema } from '@quikfill/schemas'
import { scanFigma } from './scan-figma'
import { installFigma, makeFigmaStub, makeFrame, makeTextNode } from './test-support'

let restore = (): void => {}
afterEach(() => restore())

describe('scanFigma', () => {
  it('produces valid DetectedFields for text nodes (page scope)', () => {
    const email = makeTextNode({ id: 'n1', name: 'Email', characters: 'old@x.com' })
    const phone = makeTextNode({ id: 'n2', name: 'Phone', characters: '' })
    const frame = makeFrame('f1', 'Sign up', [email, phone])
    restore = installFigma(makeFigmaStub({ pageChildren: [frame] }))

    const result = scanFigma('page')
    expect(result.fields).toHaveLength(2)
    for (const field of result.fields) {
      expect(() => detectedFieldSchema.parse(field)).not.toThrow()
    }
    const [a, b] = result.fields
    expect(a.labelText).toBe('Email')
    expect(a.currentValue).toBe('old@x.com')
    expect(a.sectionHeading).toBe('Sign up')
    expect(a.selectorCandidates).toEqual(['n1'])
    expect(b.currentValue).toBeNull() // empty text → null
    expect(result.structureHash).toBeTruthy()
  })

  it('scans only the selection in selection scope', () => {
    const a = makeTextNode({ id: 'n1', name: 'Email' })
    const b = makeTextNode({ id: 'n2', name: 'Phone' })
    restore = installFigma(makeFigmaStub({ pageChildren: [a, b], selection: [a] }))
    expect(scanFigma('selection').fields).toHaveLength(1)
  })

  it('drops locked/hidden layers by default, includes them (flagged) on request', () => {
    const node = makeTextNode({ id: 'n1', name: 'Email', locked: true, visible: false })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    // Default: hidden + locked are excluded, mirroring the DOM scanner.
    expect(scanFigma('page').fields).toHaveLength(0)
    // Opt-in: surfaced, with disabled/visible flags so the planner still skips them.
    const [field] = scanFigma('page', { includeHidden: true, includeNonFillable: true }).fields
    expect(field.disabled).toBe(true)
    expect(field.visible).toBe(false)
  })

  it('produces a stable fingerprint that changes on rename', () => {
    const node = makeTextNode({ id: 'n1', name: 'Email' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const first = scanFigma('page').fields[0].domFingerprint
    expect(scanFigma('page').fields[0].domFingerprint).toBe(first)
    node.name = 'Phone'
    expect(scanFigma('page').fields[0].domFingerprint).not.toBe(first)
  })
})
