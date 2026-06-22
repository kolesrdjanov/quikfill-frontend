import { computed, readonly, ref } from 'vue'
import type { Entitlements } from '@quikfill/schemas'
import {
  fillsRemaining as fillsRemainingOf,
  isNearQuota as isNearQuotaOf,
  isOverQuota as isOverQuotaOf,
  isUnlimited as isUnlimitedOf,
  usagePercent as usagePercentOf,
} from '@quikfill/schemas'
import {
  ENTITLEMENTS_STATE_KEY,
  refreshEntitlements as refreshEntitlementsMsg,
  requestEntitlements,
} from '@quikfill/browser-adapter'

/**
 * The surface-facing entitlements contract. The api-client lives in the
 * background worker (see `createBackgroundEntitlements`); this composable is the
 * thin reactive shell the side panel / popup bind to. It seeds from the
 * background and stays in sync via `storage.onChanged`, so a plan change or a
 * usage bump propagates to every surface.
 *
 * Gating is AI-only: when `isOverQuota`, the "Ask AI" action is disabled — but
 * scanning and filling from saved data are never gated. A `null` snapshot
 * (unknown) is treated optimistically: nothing is gated and no chip is shown.
 *
 * Module-level singleton (like `useAuth` / `useSettings`) so every component in
 * a surface shares one reactive state.
 */
const entitlements = ref<Entitlements | null>(null)
// Set once a refresh comes back empty with nothing cached (offline at cold start,
// or a contract/parse mismatch the background swallowed) — lets the popup tell a
// hard failure apart from "still loading". Cleared the moment we have a snapshot.
const loadFailed = ref(false)
let initialized = false

function apply(next: Entitlements | null): void {
  entitlements.value = next
  if (next) loadFailed.value = false
}

export function useEntitlements() {
  /** Hydrate from the background and subscribe to cross-surface changes. Idempotent. */
  async function init(): Promise<Entitlements | null> {
    if (initialized) return entitlements.value
    initialized = true
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const change = changes[ENTITLEMENTS_STATE_KEY]
      if (change) apply((change.newValue as Entitlements | undefined) ?? null)
    })
    apply(await requestEntitlements())
    return entitlements.value
  }

  /** Ask the background to re-fetch (e.g. after an AI 429 or returning from billing). */
  async function refresh(): Promise<Entitlements | null> {
    const next = await refreshEntitlementsMsg()
    // The background returns its last-known snapshot on a soft failure, so a `null`
    // means the fetch yielded nothing AND nothing was cached — a hard load failure,
    // not "still loading". Keep any existing snapshot rather than blanking it, and
    // flag the failure so the popup can offer a retry instead of an eternal loader.
    if (next) apply(next)
    loadFailed.value = next === null && entitlements.value === null
    return next
  }

  const fillLimit = computed(() => entitlements.value?.fillLimit ?? 0)
  const fillsUsed = computed(() => entitlements.value?.fillsUsed ?? 0)
  const known = computed(() => entitlements.value !== null)

  return {
    entitlements: readonly(entitlements),
    init,
    refresh,
    known,
    /** True when a refresh failed with nothing to show — the popup offers a retry. */
    loadFailed: readonly(loadFailed),
    /** True for uncapped plans OR when the snapshot is unknown (don't show a chip). */
    isUnlimited: computed(() => !known.value || isUnlimitedOf(fillLimit.value)),
    /** True only when we know the plan AND the AI budget is exhausted. */
    isOverQuota: computed(() => known.value && isOverQuotaOf(fillsUsed.value, fillLimit.value)),
    isNearQuota: computed(() => known.value && isNearQuotaOf(fillsUsed.value, fillLimit.value)),
    usagePercent: computed(() => usagePercentOf(fillsUsed.value, fillLimit.value)),
    fillsRemaining: computed(() => fillsRemainingOf(fillsUsed.value, fillLimit.value)),
    fillsUsed,
    planName: computed(() => entitlements.value?.displayName ?? null),
    status: computed(() => entitlements.value?.status ?? null),
  }
}
