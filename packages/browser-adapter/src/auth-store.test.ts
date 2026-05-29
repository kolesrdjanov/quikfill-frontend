import { describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@quikfill/schemas'
import { createAuthStore } from './auth-store'

/** Minimal in-memory stand-in for a chrome.storage area. */
function fakeArea() {
  const data: Record<string, unknown> = {}
  return {
    get: vi.fn(async (key?: string | null) => (key == null ? { ...data } : { [key]: data[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj)
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key]
    }),
    data,
  }
}

describe('createAuthStore', () => {
  it('has no session and no tokens initially', async () => {
    const store = createAuthStore(fakeArea() as never)
    expect(await store.hasSession()).toBe(false)
    expect(await store.getAccess()).toBeUndefined()
    expect(await store.getRefresh()).toBeUndefined()
  })

  it('persists and reads back tokens', async () => {
    const store = createAuthStore(fakeArea() as never)
    await store.setTokens({ accessToken: 'acc', refreshToken: 'ref' })
    expect(await store.getAccess()).toBe('acc')
    expect(await store.getRefresh()).toBe('ref')
    expect(await store.hasSession()).toBe(true)
  })

  it('clears tokens but leaves the state snapshot alone', async () => {
    const store = createAuthStore(fakeArea() as never)
    await store.setTokens({ accessToken: 'acc', refreshToken: 'ref' })
    await store.clearTokens()
    expect(await store.getAccess()).toBeUndefined()
    expect(await store.hasSession()).toBe(false)
  })

  it('persists and reads back the (token-free) state snapshot', async () => {
    const area = fakeArea()
    const store = createAuthStore(area as never)
    const state: AuthState = { status: 'code-sent', pendingEmail: 'a@b.com' }
    await store.writeState(state)
    expect(await store.readState()).toEqual(state)
  })

  it('never writes tokens into the state snapshot key', async () => {
    const area = fakeArea()
    const store = createAuthStore(area as never)
    await store.setTokens({ accessToken: 'secret', refreshToken: 'secret2' })
    await store.writeState({
      status: 'signed-in',
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(JSON.stringify(area.data['auth:state'])).not.toContain('secret')
  })

  it('reads null state when nothing has been written', async () => {
    const store = createAuthStore(fakeArea() as never)
    expect(await store.readState()).toBeNull()
  })
})
