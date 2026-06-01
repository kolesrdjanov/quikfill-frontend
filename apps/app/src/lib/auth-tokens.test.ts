import { afterEach, describe, expect, it } from 'vitest'
import { authTokens } from './auth-tokens'

afterEach(() => {
  localStorage.clear()
})

describe('authTokens', () => {
  it('persists and reads back the access + refresh tokens', () => {
    authTokens.set({ accessToken: 'a-1', refreshToken: 'r-1' })
    expect(authTokens.getAccess()).toBe('a-1')
    expect(authTokens.getRefresh()).toBe('r-1')
    expect(authTokens.hasSession).toBe(true)
  })

  it('reports no session and undefined tokens before sign-in', () => {
    expect(authTokens.getAccess()).toBeUndefined()
    expect(authTokens.getRefresh()).toBeUndefined()
    expect(authTokens.hasSession).toBe(false)
  })

  it('clear() removes both tokens (sign-out)', () => {
    authTokens.set({ accessToken: 'a-1', refreshToken: 'r-1' })
    authTokens.clear()
    expect(authTokens.getAccess()).toBeUndefined()
    expect(authTokens.getRefresh()).toBeUndefined()
    expect(authTokens.hasSession).toBe(false)
  })
})
