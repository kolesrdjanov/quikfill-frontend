<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ArrowUpRight, LogOut } from 'lucide-vue-next'
import { Badge, Button } from '@quikfill/ui'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// v2 surface: the toolbar popup is auth → success → a mini-dashboard of the user's
// subscription/usage, with a Manage button that opens the full dashboard app. No
// settings and no on-page scan live here — filling happens on the page (overlay).
const DASHBOARD_URL = import.meta.env.PROD ? 'https://app.quikfill.io' : 'http://localhost:5173'

const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

const planLine = computed(() => {
  if (!entitlements.known.value) return null
  const name = entitlements.planName.value ?? 'Plan'
  const status = entitlements.status.value
  return status && status !== 'active' ? `${name} · ${status}` : name
})

const usageText = computed(() => {
  if (!entitlements.known.value) return 'Loading your plan…'
  if (entitlements.isUnlimited.value) return 'Unlimited AI fills'
  if (entitlements.isOverQuota.value) return 'AI limit reached — resets next month'
  return `≈ ${entitlements.fillsRemaining.value.toLocaleString()} AI fills left this month`
})

const showBar = computed(() => entitlements.known.value && !entitlements.isUnlimited.value)
const barPct = computed(() => Math.min(100, Math.max(0, entitlements.usagePercent.value)))
const barClass = computed(() =>
  entitlements.isOverQuota.value
    ? 'bg-destructive'
    : entitlements.isNearQuota.value
      ? 'bg-warning'
      : 'bg-primary',
)

onMounted(async () => {
  initTheme('auto')
  await gate.init()
  await entitlements.init()
})

function openDashboard() {
  void browser.tabs?.create({ url: DASHBOARD_URL })
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[340px]">
    <!-- AUTH: log in / sign up → enter code → success (all handled by AuthPanel) -->
    <AuthPanel v-if="!gate.isAppReady.value" />

    <!-- MINI-DASHBOARD -->
    <div v-else class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <BrandLockup />
        <Button variant="ghost" size="sm" class="gap-1.5" @click="gate.signOut()">
          <LogOut class="size-3.5" />
          Sign out
        </Button>
      </div>

      <div class="bg-muted/40 flex flex-col gap-3 rounded-[12px] border p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold">{{ planLine ?? 'Your plan' }}</span>
          <Badge v-if="entitlements.isOverQuota.value" variant="danger">AI limit reached</Badge>
        </div>
        <p class="text-muted-foreground text-[12px]">{{ usageText }}</p>
        <div v-if="showBar" class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all"
            :class="barClass"
            :style="{ width: `${barPct}%` }"
          />
        </div>
      </div>

      <p v-if="gate.user.value?.email" class="text-muted-foreground px-1 text-[11px]">
        Signed in as {{ gate.user.value.email }}
      </p>

      <Button class="w-full" @click="openDashboard">
        Manage subscription
        <ArrowUpRight class="size-4" />
      </Button>

      <p class="text-muted-foreground px-1 text-center text-[11px] leading-snug">
        Fill happens on the page — look for the QuikFill button near each form.
      </p>
    </div>
  </div>
</template>
