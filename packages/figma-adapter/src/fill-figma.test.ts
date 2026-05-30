import { afterEach, describe, expect, it } from 'vitest'
import type { FillInstruction } from '@quikfill/schemas'
import { applyFigmaFill, applyFigmaUndo } from './fill-figma'
import { installFigma, makeFigmaStub, makeTextNode } from './test-support'

let restore = (): void => {}
afterEach(() => restore())

function instruction(
  over: Partial<FillInstruction> & { detectedFieldId: string; selectorCandidates: string[] },
): FillInstruction {
  return {
    frame: 'main',
    shadow: false,
    tagName: 'figma:text',
    inputType: 'text',
    fillStrategy: 'nativeInput',
    proposedValue: 'X',
    ...over,
  }
}

describe('applyFigmaFill', () => {
  it('writes characters and captures the prior value for undo', async () => {
    const node = makeTextNode({ id: 'n1', name: 'Email', characters: 'old' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { results, undoSnapshot } = await applyFigmaFill([
      instruction({
        detectedFieldId: 'f1',
        selectorCandidates: ['n1'],
        proposedValue: 'new@x.com',
      }),
    ])
    expect(node.characters).toBe('new@x.com')
    expect(results[0]).toMatchObject({ detectedFieldId: 'f1', status: 'success' })
    expect(undoSnapshot.entries[0].previousValue).toBe('old')
  })

  it('skips an empty proposed value without writing', async () => {
    const node = makeTextNode({ id: 'n1', characters: 'keep' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'], proposedValue: '' }),
    ])
    expect(results[0].status).toBe('skipped')
    expect(node.characters).toBe('keep')
  })

  it('skips a whitespace-only proposed value (mirrors form-scanner trim)', async () => {
    const node = makeTextNode({ id: 'n1', characters: 'keep' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'], proposedValue: '   \n' }),
    ])
    expect(results[0].status).toBe('skipped')
    expect(node.characters).toBe('keep')
  })

  it('skips a missing-font node without writing', async () => {
    const node = makeTextNode({
      id: 'n1',
      characters: 'keep',
      fontName: { family: 'Ghost', style: 'Regular' },
    })
    restore = installFigma(
      makeFigmaStub({
        pageChildren: [node],
        missingFonts: [{ family: 'Ghost', style: 'Regular' }],
      }),
    )
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'] }),
    ])
    expect(results[0].status).toBe('skipped')
    expect(node.characters).toBe('keep')
  })

  it('skips a non-nativeInput strategy', async () => {
    const node = makeTextNode({ id: 'n1' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'], fillStrategy: 'select' }),
    ])
    expect(results[0].status).toBe('skipped')
  })

  it('fails when the target node is not found', async () => {
    restore = installFigma(makeFigmaStub({ pageChildren: [] }))
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['ghost'] }),
    ])
    expect(results[0].status).toBe('failed')
  })

  it('never returns an "assisted" status', async () => {
    const node = makeTextNode({ id: 'n1' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { results } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'] }),
    ])
    expect(results.every((r) => r.status !== 'assisted')).toBe(true)
  })
})

describe('applyFigmaUndo', () => {
  it('restores the previous value', async () => {
    const node = makeTextNode({ id: 'n1', characters: 'old' })
    restore = installFigma(makeFigmaStub({ pageChildren: [node] }))
    const { undoSnapshot } = await applyFigmaFill([
      instruction({ detectedFieldId: 'f1', selectorCandidates: ['n1'], proposedValue: 'new' }),
    ])
    expect(node.characters).toBe('new')
    await applyFigmaUndo(undoSnapshot)
    expect(node.characters).toBe('old')
  })
})
