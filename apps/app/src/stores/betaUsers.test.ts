import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BetaUser } from '@quikfill/schemas'

const listBetaUsers = vi.fn()
const inviteBetaUser = vi.fn()
const removeBetaUser = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    admin: {
      listBetaUsers: (...args: unknown[]) => listBetaUsers(...args),
      inviteBetaUser: (...args: unknown[]) => inviteBetaUser(...args),
      removeBetaUser: (...args: unknown[]) => removeBetaUser(...args),
    },
  },
}))

import { useBetaUsersStore } from './betaUsers'

function betaUser(overrides: Partial<BetaUser> = {}): BetaUser {
  return {
    id: 'b-1',
    email: 'tester@example.com',
    invitedByEmail: 'admin@quikfill.io',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('betaUsers store', () => {
  it('fetch loads the allowlist and clears loading', async () => {
    const rows = [betaUser()]
    listBetaUsers.mockResolvedValue(rows)
    const store = useBetaUsersStore()

    await store.fetch()

    expect(store.loading).toBe(false)
    expect(store.items).toEqual(rows)
  })

  it('invite prepends a newly added row', async () => {
    const store = useBetaUsersStore()
    store.items = [betaUser({ id: 'b-1' })]
    const created = betaUser({ id: 'b-2', email: 'new@example.com' })
    inviteBetaUser.mockResolvedValue(created)

    const result = await store.invite('new@example.com')

    expect(inviteBetaUser).toHaveBeenCalledWith({ email: 'new@example.com' })
    expect(result).toEqual(created)
    expect(store.items).toHaveLength(2)
    expect(store.items[0]).toEqual(created)
  })

  it('invite is idempotent: re-inviting replaces the row without duplicating', async () => {
    const store = useBetaUsersStore()
    store.items = [betaUser({ id: 'b-1', email: 'dup@example.com' })]
    inviteBetaUser.mockResolvedValue(betaUser({ id: 'b-1', email: 'dup@example.com' }))

    await store.invite('dup@example.com')

    expect(store.items).toHaveLength(1)
  })

  it('remove deletes the row by id', async () => {
    const store = useBetaUsersStore()
    store.items = [betaUser({ id: 'b-1' }), betaUser({ id: 'b-2' })]
    removeBetaUser.mockResolvedValue(undefined)

    await store.remove('b-1')

    expect(removeBetaUser).toHaveBeenCalledWith('b-1')
    expect(store.items.map((item) => item.id)).toEqual(['b-2'])
  })
})
