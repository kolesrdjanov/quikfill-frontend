<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '@quikfill/ui'
import { useSubscriptionStore } from '@/stores/subscription'
import { useApiError } from '@/composables/useApiError'

const router = useRouter()
const subscription = useSubscriptionStore()
const { handleError } = useApiError()

onMounted(async () => {
  // The Stripe webhook that flips the subscription may land just after redirect,
  // so poll until the plan changes from whatever we last knew (default Free).
  const previous = subscription.entitlements?.planKey ?? 'free'
  try {
    await subscription.refetchUntilChanged(previous, { tries: 5, delayMs: 1500 })
    const name = subscription.entitlements?.displayName ?? 'new'
    toast.success(`You're on the ${name} plan 🎉`)
  } catch (error) {
    handleError(error)
  } finally {
    await router.replace('/settings/billing')
  }
})
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
    <div class="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
    <p class="text-muted-foreground text-sm">Finalizing your subscription…</p>
  </div>
</template>
