import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { Entitlements, PaidPlanKey, PlanKey } from '@quikfill/schemas'

/**
 * Owns the signed-in user's live billing state (`GET /entitlements`) and the
 * redirects into Stripe-hosted Checkout / Customer Portal. Views call these
 * actions and surface errors via `useApiError` — the store never toasts.
 */
export const useSubscriptionStore = defineStore('subscription', () => {
  const entitlements = ref<Entitlements | null>(null)
  const loading = ref(false)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      entitlements.value = await api.subscriptions.entitlements()
    } finally {
      loading.value = false
    }
  }

  /** Begin a Stripe Checkout for a paid plan and redirect the browser to it. */
  async function startCheckout(planKey: PaidPlanKey): Promise<void> {
    const { url } = await api.subscriptions.createCheckoutSession({ planKey })
    window.location.assign(url)
  }

  /** Open the Stripe Customer Portal (cards, invoices, cancel, plan switch). */
  async function openPortal(): Promise<void> {
    const { url } = await api.subscriptions.createPortalSession()
    window.location.assign(url)
  }

  /**
   * Poll `/entitlements` until the plan key changes away from `previousPlanKey`
   * (or `tries` is exhausted) — used after returning from Checkout, since the
   * Stripe webhook that updates the subscription may land a beat after redirect.
   */
  async function refetchUntilChanged(
    previousPlanKey: PlanKey,
    options: { tries?: number; delayMs?: number } = {},
  ): Promise<void> {
    const tries = options.tries ?? 5
    const delayMs = options.delayMs ?? 1200
    for (let attempt = 0; attempt < tries; attempt++) {
      await fetch()
      if (entitlements.value && entitlements.value.planKey !== previousPlanKey) return
      if (attempt < tries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  return { entitlements, loading, fetch, startCheckout, openPortal, refetchUntilChanged }
})
