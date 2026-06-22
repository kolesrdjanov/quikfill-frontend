import { describe, expect, it, vi } from 'vitest'
import type { AuthTokens, UserAccount } from '@quikfill/schemas'
import { createAuthStore } from './auth-store'
import { createBackgroundAuth, type AuthApi } from './background-auth'

const user: UserAccount = { id: '11111111-1111-4111-8111-111111111111', email: 'a@b.com' }
const tokens: AuthTokens = {
  accessToken: 'acc',
  refreshToken: 'ref',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user,
}

/** In-memory chrome.storage area. */
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

/** A failing api response carrying an HTTP status, like `ApiClientError`. */
function httpError(status: number) {
  return Object.assign(new Error(`status ${status}`), { status })
}

function makeApi(
  overrides: Partial<AuthApi['auth'] & { me: AuthApi['users']['me'] }> = {},
): AuthApi {
  return {
    auth: {
      requestMagicLink: vi.fn().mockResolvedValue({ message: 'sent', devCode: '123456' }),
      verify: vi.fn().mockResolvedValue(tokens),
      refresh: vi.fn().mockResolvedValue({ ...tokens, accessToken: 'acc2' }),
      logout: vi.fn().mockResolvedValue(undefined),
      redeemHandoff: vi.fn().mockResolvedValue(tokens),
      ...overrides,
    },
    users: { me: (overrides.me as AuthApi['users']['me']) ?? vi.fn().mockResolvedValue(user) },
  }
}

function setup(api = makeApi()) {
  const area = fakeArea()
  const store = createAuthStore(area as never)
  const auth = createBackgroundAuth({ api, store })
  return { api, store, area, auth }
}

describe('getState hydration', () => {
  it('reports signed-out when no tokens are stored', async () => {
    const { auth, api } = setup()
    expect(await auth.handlers.getState()).toEqual({ status: 'signed-out' })
    expect(api.users.me).not.toHaveBeenCalled()
  })

  it('hydrates to signed-in by fetching the user when tokens exist', async () => {
    const { auth, store } = setup()
    await store.setTokens(tokens)
    expect(await auth.handlers.getState()).toEqual({ status: 'signed-in', user })
  })

  it('drops a bad session when the user fetch fails', async () => {
    const api = makeApi({ me: vi.fn().mockRejectedValue(httpError(401)) })
    const { auth, store } = setup(api)
    await store.setTokens(tokens)
    expect(await auth.handlers.getState()).toEqual({ status: 'signed-out' })
    expect(await store.hasSession()).toBe(false)
  })

  it('hydrates only once', async () => {
    const { auth, api } = setup()
    await auth.handlers.getState()
    await auth.handlers.getState()
    expect(api.users.me).not.toHaveBeenCalled()
  })

  it('coalesces concurrent getState calls so a slow user fetch never leaks the loading placeholder', async () => {
    // Mirrors first-open in the worker: background.ts fires an eager getState()
    // the instant the panel wakes it, racing the panel's own getState() request.
    // The user fetch is still in flight when the second caller arrives — it must
    // wait for the real result, not skip the await and read the `loading` seed.
    let resolveMe!: (u: UserAccount) => void
    const mePromise = new Promise<UserAccount>((resolve) => (resolveMe = resolve))
    const me = vi.fn(() => mePromise)
    const { auth, store } = setup(makeApi({ me }))
    await store.setTokens(tokens)

    const first = auth.handlers.getState()
    const second = auth.handlers.getState()
    resolveMe(user)

    expect(await first).toEqual({ status: 'signed-in', user })
    expect(await second).toEqual({ status: 'signed-in', user })
    expect(me).toHaveBeenCalledTimes(1)
  })
})

describe('requestCode', () => {
  it('moves to code-sent and returns the dev code', async () => {
    const { auth, store } = setup()
    expect(await auth.handlers.requestCode('a@b.com')).toEqual({ ok: true, devCode: '123456' })
    expect(await store.readState()).toEqual({ status: 'code-sent', pendingEmail: 'a@b.com' })
  })

  it('maps a 400 to an invalid-code error', async () => {
    const api = makeApi({ requestMagicLink: vi.fn().mockRejectedValue(httpError(400)) })
    const { auth } = setup(api)
    expect(await auth.handlers.requestCode('bad')).toEqual({ ok: false, error: 'invalid-code' })
  })

  it('maps a 429 to a quota-exceeded error', async () => {
    const api = makeApi({ requestMagicLink: vi.fn().mockRejectedValue(httpError(429)) })
    const { auth } = setup(api)
    expect(await auth.handlers.requestCode('a@b.com')).toEqual({
      ok: false,
      error: 'quota-exceeded',
    })
  })

  it('treats a 401 on the public endpoint as invalid-code, not session-expired', async () => {
    const api = makeApi({ requestMagicLink: vi.fn().mockRejectedValue(httpError(401)) })
    const { auth } = setup(api)
    expect(await auth.handlers.requestCode('a@b.com')).toEqual({ ok: false, error: 'invalid-code' })
  })
})

describe('verify', () => {
  it('stores tokens and returns the signed-in state', async () => {
    const { auth, store } = setup()
    const result = await auth.handlers.verify('a@b.com', '123456')
    expect(result).toEqual({ ok: true, state: { status: 'signed-in', user } })
    expect(await store.getAccess()).toBe('acc')
    expect(await store.readState()).toEqual({ status: 'signed-in', user })
  })

  it('maps a bad code to invalid-code and stores no tokens', async () => {
    const api = makeApi({ verify: vi.fn().mockRejectedValue(httpError(400)) })
    const { auth, store } = setup(api)
    expect(await auth.handlers.verify('a@b.com', '000000')).toEqual({
      ok: false,
      error: 'invalid-code',
    })
    expect(await store.hasSession()).toBe(false)
  })

  it('maps the backend INVALID_TOKEN (401) on verify to invalid-code, not unauthorized', async () => {
    // The backend returns the same INVALID_TOKEN (401) for wrong/expired/unknown
    // — on the public verify endpoint that means "bad code", never a dead session.
    const api = makeApi({ verify: vi.fn().mockRejectedValue(httpError(401)) })
    const { auth } = setup(api)
    expect(await auth.handlers.verify('a@b.com', '000000')).toEqual({
      ok: false,
      error: 'invalid-code',
    })
  })

  it('still surfaces a 429 on verify as quota-exceeded (rate limit / too many attempts)', async () => {
    const api = makeApi({ verify: vi.fn().mockRejectedValue(httpError(429)) })
    const { auth } = setup(api)
    expect(await auth.handlers.verify('a@b.com', '000000')).toEqual({
      ok: false,
      error: 'quota-exceeded',
    })
  })
})

describe('adoptHandoff', () => {
  it('redeems a handoff code, stores tokens, and returns the signed-in state', async () => {
    const { auth, store, api } = setup()
    const result = await auth.handlers.adoptHandoff('h4nd0ff')
    expect(api.auth.redeemHandoff).toHaveBeenCalledWith('h4nd0ff')
    expect(result).toEqual({ ok: true, state: { status: 'signed-in', user } })
    expect(await store.getAccess()).toBe('acc')
    expect(await store.readState()).toEqual({ status: 'signed-in', user })
  })

  it('stores nothing and stays signed-out when the code is invalid (silent best-effort)', async () => {
    const api = makeApi({ redeemHandoff: vi.fn().mockRejectedValue(httpError(401)) })
    const { auth, store } = setup(api)
    const result = await auth.handlers.adoptHandoff('bad')
    expect(result.ok).toBe(false)
    expect(await store.hasSession()).toBe(false)
  })
})

describe('logout', () => {
  it('revokes the refresh token, clears the session, and goes signed-out', async () => {
    const { auth, store, api } = setup()
    await store.setTokens(tokens)
    expect(await auth.handlers.logout()).toEqual({ ok: true })
    expect(api.auth.logout).toHaveBeenCalledWith('ref')
    expect(await store.hasSession()).toBe(false)
    expect(await store.readState()).toEqual({ status: 'signed-out' })
  })

  it('still clears locally when the revoke call fails', async () => {
    const api = makeApi({ logout: vi.fn().mockRejectedValue(httpError(503)) })
    const { auth, store } = setup(api)
    await store.setTokens(tokens)
    expect(await auth.handlers.logout()).toEqual({ ok: true })
    expect(await store.hasSession()).toBe(false)
  })
})

describe('refreshAuth (api-client hook)', () => {
  it('rotates tokens and returns the new access token', async () => {
    const { auth, store } = setup()
    await store.setTokens(tokens)
    expect(await auth.refreshAuth()).toBe('acc2')
    expect(await store.getAccess()).toBe('acc2')
  })

  it('returns undefined with no refresh token', async () => {
    const { auth } = setup()
    expect(await auth.refreshAuth()).toBeUndefined()
  })

  it('clears the session when refresh fails', async () => {
    const api = makeApi({ refresh: vi.fn().mockRejectedValue(httpError(401)) })
    const { auth, store } = setup(api)
    await store.setTokens(tokens)
    expect(await auth.refreshAuth()).toBeUndefined()
    expect(await store.hasSession()).toBe(false)
  })
})

describe('onAuthError (forced sign-out)', () => {
  it('clears tokens and writes an unauthorized error snapshot', async () => {
    const { auth, store } = setup()
    await store.setTokens(tokens)
    await auth.onAuthError()
    expect(await store.hasSession()).toBe(false)
    expect(await store.readState()).toEqual({ status: 'error', error: 'unauthorized' })
  })
})
