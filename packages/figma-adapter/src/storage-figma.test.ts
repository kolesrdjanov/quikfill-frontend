import { afterEach, describe, expect, it } from 'vitest'
import { createFigmaClientStorageAdapter } from './storage-figma'
import { installFigma, makeFigmaStub } from './test-support'

let restore = (): void => {}
afterEach(() => restore())

describe('createFigmaClientStorageAdapter', () => {
  it('round-trips a live object (no JSON serialization)', async () => {
    restore = installFigma(makeFigmaStub())
    const store = createFigmaClientStorageAdapter()
    const value = { a: 1, nested: { b: [2, 3] } }
    await store.set('qf:profile', value)
    expect(await store.get('qf:profile')).toEqual(value)
  })

  it('returns null for an absent key', async () => {
    restore = installFigma(makeFigmaStub())
    expect(await createFigmaClientStorageAdapter().get('missing')).toBeNull()
  })

  it('deletes a key', async () => {
    restore = installFigma(makeFigmaStub({ storage: { k: 1 } }))
    const store = createFigmaClientStorageAdapter()
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })

  it('lists keys by prefix', async () => {
    restore = installFigma(makeFigmaStub({ storage: { 'qf:a': 1, 'qf:b': 2, other: 3 } }))
    const keys = await createFigmaClientStorageAdapter().list('qf:')
    expect(keys.sort()).toEqual(['qf:a', 'qf:b'])
  })
})
