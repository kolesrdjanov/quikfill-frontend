import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/lib/api'
import { authTokens } from '@/lib/auth-tokens'
import { useAuthStore } from './auth'
import type { AuthTokens } from '@quikfill/schemas'
vi.mock('@/lib/api', () => ({ api: { auth: { verify: vi.fn(), logout: vi.fn() } } }))
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.resetAllMocks()
})
it('signs out locally without waiting for network revocation', async () => {
  authTokens.set({ accessToken: 'a', refreshToken: 'r' })
  vi.mocked(api.auth.logout).mockImplementation(() => new Promise(() => {}))
  const auth = useAuthStore()
  auth.user = { id: 'a' }
  await auth.logout()
  expect(auth.user).toBeNull()
  expect(authTokens.hasSession).toBe(false)
  expect(api.auth.logout).toHaveBeenCalledWith('r')
})
it('does not restore a verification that completed after logout', async () => {
  let release!: (tokens: AuthTokens) => void
  vi.mocked(api.auth.verify).mockImplementation(
    () =>
      new Promise((r) => {
        release = r
      }),
  )
  const auth = useAuthStore()
  const verifying = auth.verify('a@example.com', '123456')
  await auth.logout()
  release({
    accessToken: 'a',
    refreshToken: 'r',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: { id: 'a' },
  })
  await verifying
  expect(auth.user).toBeNull()
  expect(authTokens.hasSession).toBe(false)
})
