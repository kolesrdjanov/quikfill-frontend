import { afterEach, describe, expect, it } from 'vitest'
import { ensureFontsLoaded, fontsOfNode, isMixed } from './fonts'
import { MIXED, installFigma, makeFigmaStub, makeTextNode } from './test-support'

let restore = (): void => {}
afterEach(() => restore())

describe('isMixed', () => {
  it('detects the figma.mixed sentinel', () => {
    restore = installFigma(makeFigmaStub())
    expect(isMixed(MIXED)).toBe(true)
    expect(isMixed({ family: 'Inter', style: 'Regular' })).toBe(false)
  })
})

describe('ensureFontsLoaded', () => {
  it('loads a concrete font and reports ready', async () => {
    const stub = makeFigmaStub()
    restore = installFigma(stub)
    const node = makeTextNode({ id: 'a', fontName: { family: 'Inter', style: 'Bold' } })
    expect(await ensureFontsLoaded(node)).toEqual({ status: 'ready' })
    expect(stub.loaded).toContainEqual({ family: 'Inter', style: 'Bold' })
  })

  it('reports missing when the font is unavailable, without throwing', async () => {
    const stub = makeFigmaStub({ missingFonts: [{ family: 'Ghost', style: 'Regular' }] })
    restore = installFigma(stub)
    const node = makeTextNode({ id: 'a', fontName: { family: 'Ghost', style: 'Regular' } })
    expect(await ensureFontsLoaded(node)).toEqual({
      status: 'missing',
      fonts: [{ family: 'Ghost', style: 'Regular' }],
    })
  })

  it('skips a mixed-font node without loading anything', async () => {
    const stub = makeFigmaStub()
    restore = installFigma(stub)
    const node = makeTextNode({ id: 'a', fontName: MIXED })
    expect(await ensureFontsLoaded(node)).toEqual({ status: 'mixedUnhandled' })
    expect(stub.loaded).toHaveLength(0)
  })
})

describe('fontsOfNode', () => {
  it('dedupes the distinct fonts of a mixed node', () => {
    restore = installFigma(makeFigmaStub())
    const inter = { family: 'Inter', style: 'Regular' }
    const bold = { family: 'Inter', style: 'Bold' }
    const node = makeTextNode({
      id: 'a',
      characters: 'hi',
      fontName: MIXED,
      rangeFonts: [inter, bold, inter],
    })
    expect(fontsOfNode(node)).toEqual([inter, bold])
  })
})
