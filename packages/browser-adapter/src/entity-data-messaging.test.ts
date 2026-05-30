import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntityRecord, EntityType } from '@quikfill/schemas'
import {
  ENTITY_DATA_REQUEST,
  isEntityDataRequest,
  onEntityDataRequest,
  requestEntityData,
} from './entity-data-messaging'

const types: EntityType[] = [
  {
    id: 'person',
    name: 'Person',
    fields: [{ key: 'email', label: 'Email', type: 'email', required: false }],
  },
]
const records: EntityRecord[] = [
  { id: 'r1', entityTypeId: 'person', name: 'Ada', values: { email: 'ada@example.com' } },
]

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined

function installChrome(sendMessage = vi.fn()) {
  const listeners: Listener[] = []
  const runtime = {
    sendMessage,
    onMessage: { addListener: vi.fn((l: Listener) => listeners.push(l)) },
  }
  ;(globalThis as { chrome?: unknown }).chrome = { runtime }
  return { listeners, runtime }
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
  vi.restoreAllMocks()
})

describe('isEntityDataRequest', () => {
  it('accepts its own request and rejects others', () => {
    expect(isEntityDataRequest({ type: ENTITY_DATA_REQUEST })).toBe(true)
    expect(isEntityDataRequest({ type: 'OTHER' })).toBe(false)
    expect(isEntityDataRequest(null)).toBe(false)
  })
})

describe('requestEntityData', () => {
  it('returns the background snapshot', async () => {
    const { runtime } = installChrome(vi.fn().mockResolvedValue({ ok: true, types, records }))
    const response = await requestEntityData()
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: ENTITY_DATA_REQUEST })
    expect(response).toEqual({ ok: true, types, records })
  })

  it('fails gracefully when the background is unreachable', async () => {
    installChrome(vi.fn().mockRejectedValue(new Error('no receiver')))
    expect(await requestEntityData()).toEqual({ ok: false })
  })
})

describe('onEntityDataRequest', () => {
  it('invokes the handler and responds with the snapshot', async () => {
    const { listeners } = installChrome()
    onEntityDataRequest(vi.fn().mockResolvedValue({ types, records }))
    const sendResponse = vi.fn()
    const keepOpen = listeners[0]({ type: ENTITY_DATA_REQUEST }, {}, sendResponse)
    expect(keepOpen).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, types, records })
  })

  it('responds with ok:false when the handler throws', async () => {
    const { listeners } = installChrome()
    onEntityDataRequest(vi.fn().mockRejectedValue(new Error('offline')))
    const sendResponse = vi.fn()
    listeners[0]({ type: ENTITY_DATA_REQUEST }, {}, sendResponse)
    await new Promise((r) => setTimeout(r, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: false })
  })
})
