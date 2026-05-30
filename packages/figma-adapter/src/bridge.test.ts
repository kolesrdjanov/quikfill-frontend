import { afterEach, describe, expect, it } from 'vitest'
import {
  FILL_REQUEST,
  RESPONSE,
  SCAN_REQUEST,
  isFillRequest,
  isResponse,
  isScanRequest,
  mountSandboxBridge,
  onFillRequest,
  onScanRequest,
} from './bridge'
import { installFigma, makeFigmaStub } from './test-support'

let restore = (): void => {}
afterEach(() => restore())

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('request guards', () => {
  it('discriminate by type', () => {
    expect(isScanRequest({ type: SCAN_REQUEST, id: '1' })).toBe(true)
    expect(isScanRequest({ type: FILL_REQUEST, id: '1' })).toBe(false)
    expect(isResponse({ type: RESPONSE, id: '1', result: null })).toBe(true)
    expect(isFillRequest(null)).toBe(false)
  })
})

describe('sandbox bridge dispatch', () => {
  it('routes a scan request to its handler and replies with the correlated id', async () => {
    const stub = makeFigmaStub()
    restore = installFigma(stub)
    let seenScope: string | undefined
    const result = { fields: [], limitations: [] }
    onScanRequest((scope) => {
      seenScope = scope
      return result
    })
    mountSandboxBridge()

    stub.emit({ type: SCAN_REQUEST, id: 'req-1', scope: 'selection' })
    await tick()

    expect(seenScope).toBe('selection')
    expect(stub.sent).toContainEqual({ type: RESPONSE, id: 'req-1', result })
  })

  it('correlates concurrent requests by id', async () => {
    const stub = makeFigmaStub()
    restore = installFigma(stub)
    onScanRequest(() => ({ fields: [], limitations: [] }))
    onFillRequest(() => ({ results: [], undoSnapshot: { entries: [] } }))
    mountSandboxBridge()

    stub.emit({ type: SCAN_REQUEST, id: 'a' })
    stub.emit({ type: FILL_REQUEST, id: 'b', instructions: [] })
    await tick()

    const ids = stub.sent.map((m) => (m as { id: string }).id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
  })
})
