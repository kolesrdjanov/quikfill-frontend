import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlements } from '@quikfill/schemas'

// The background owner (`createBackgroundEntitlements`) returns its last-known
// snapshot on a soft failure, so a `null` from the refresh message means the fetch
// produced nothing AND nothing was cached — a real load failure, not "still
// loading". Mock the messaging layer so we can drive that exact distinction.
const { refreshEntitlementsMock, requestEntitlementsMock } = vi.hoisted(() => ({
  refreshEntitlementsMock: vi.fn(),
  requestEntitlementsMock: vi.fn(),
}))

vi.mock('@quikfill/browser-adapter', () => ({
  ENTITLEMENTS_STATE_KEY: 'entitlements:current',
  refreshEntitlements: refreshEntitlementsMock,
  requestEntitlements: requestEntitlementsMock,
}))

const SNAPSHOT: Entitlements = {
  planKey: 'pro',
  displayName: 'Pro',
  status: 'active',
  fillsUsed: 5,
  fillLimit: 1000,
}

// `useEntitlements` is a module-level singleton, so reset the registry and re-import
// per test to get a fresh reactive state. (`init()` — the only path that touches the
// `browser` global — is never called here, so jsdom needs no chrome stub.)
async function freshComposable() {
  vi.resetModules()
  const { useEntitlements } = await import('./useEntitlements')
  return useEntitlements()
}

beforeEach(() => {
  refreshEntitlementsMock.mockReset()
  requestEntitlementsMock.mockReset()
})

describe('useEntitlements — load failure vs loading', () => {
  it('flags loadFailed when a signed-in refresh returns nothing and nothing is cached', async () => {
    const e = await freshComposable()
    refreshEntitlementsMock.mockResolvedValue(null)

    await e.refresh()

    // Distinguishable from "still loading": the panel can show an error + retry
    // instead of an indefinite "Loading your plan…".
    expect(e.known.value).toBe(false)
    expect(e.loadFailed.value).toBe(true)
  })

  it('keeps the last-known snapshot (no failure) when a later refresh returns null', async () => {
    const e = await freshComposable()
    refreshEntitlementsMock.mockResolvedValueOnce(SNAPSHOT)
    await e.refresh()
    refreshEntitlementsMock.mockResolvedValueOnce(null)

    await e.refresh()

    expect(e.known.value).toBe(true) // a transient blip must not wipe good data
    expect(e.loadFailed.value).toBe(false)
  })

  it('clears loadFailed once a retry succeeds', async () => {
    const e = await freshComposable()
    refreshEntitlementsMock.mockResolvedValueOnce(null)
    await e.refresh()
    expect(e.loadFailed.value).toBe(true)

    refreshEntitlementsMock.mockResolvedValueOnce(SNAPSHOT)
    await e.refresh()

    expect(e.loadFailed.value).toBe(false)
    expect(e.known.value).toBe(true)
  })
})
