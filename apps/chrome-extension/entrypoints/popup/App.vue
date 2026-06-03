<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowUpRight, Check, LogOut, Mail, RefreshCw } from 'lucide-vue-next'
import { Badge, Button } from '@quikfill/ui'
import {
  onExtensionSettingsChange,
  readExtensionSettings,
  requestSettingsSync,
} from '@quikfill/browser-adapter'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import { SUPPORT_MAILTO } from '../../lib/external-urls'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// v2 surface: the toolbar popup is auth → success → a mini-dashboard of the user's
// subscription/usage, with a Manage button that opens the full dashboard app. No
// settings and no on-page scan live here — filling happens on the page (overlay).
const DASHBOARD_URL = import.meta.env.PROD ? 'https://app.quikfill.io' : 'http://localhost:5173'

const { init: initTheme, apply: applyTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

// Settings are dashboard-owned and synced down by the background worker. Re-pull
// them whenever the popup opens (and on demand via the Sync button) so a change
// made in the dashboard takes effect without waiting for a sign-in / SW recycle.
// The background's storage write also wakes any open page's overlay live.
const syncState = ref<'idle' | 'syncing' | 'done'>('idle')
let unsubscribeSettings: () => void = () => {}
let doneTimer: ReturnType<typeof setTimeout> | undefined

async function syncSettings(): Promise<void> {
  if (syncState.value === 'syncing') return
  syncState.value = 'syncing'
  const synced = await requestSettingsSync()
  // Reflect the synced theme now; fall back to the cached value if the pull
  // failed (offline / signed out) so the popup still themes correctly.
  applyTheme((synced ?? (await readExtensionSettings())).theme)
  syncState.value = synced ? 'done' : 'idle'
  if (syncState.value === 'done') {
    if (doneTimer) clearTimeout(doneTimer)
    doneTimer = setTimeout(() => (syncState.value = 'idle'), 1500)
  }
}

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
  // Apply the last-known theme straight away so the popup never flashes the wrong
  // mode, then react live to any later settings change (manual / periodic sync, or
  // a dashboard save synced down by the background).
  initTheme((await readExtensionSettings()).theme)
  unsubscribeSettings = onExtensionSettingsChange((s) => applyTheme(s.theme))
  await gate.init()
  await entitlements.init()
  // init() only reads the background's cached snapshot, which is warmed once at
  // service-worker startup — usually while still signed out, so it's empty. Fetch
  // live numbers + re-sync settings whenever the gate is ready (on open) and again
  // right after an in-popup sign-in, otherwise the mini-dashboard shows "Loading…"
  // forever and settings stay stale.
  if (gate.isAppReady.value) {
    void entitlements.refresh()
    void syncSettings()
  }
})

onUnmounted(() => {
  unsubscribeSettings()
  if (doneTimer) clearTimeout(doneTimer)
})

watch(
  () => gate.isAppReady.value,
  (ready) => {
    if (ready) {
      void entitlements.refresh()
      void syncSettings()
    }
  },
)

function openDashboard() {
  void browser.tabs?.create({ url: `${DASHBOARD_URL}/settings/billing` })
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[340px]">
    <!-- AUTH: log in / sign up → enter code → success (all handled by AuthPanel).
         PanelShell sizes to content (no forced viewport/full height) so the popup
         grows to fit each screen — no clipping, no scrollbar. -->
    <AuthPanel v-if="!gate.isAppReady.value" />

    <!-- MINI-DASHBOARD -->
    <div v-else class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <BrandLockup />
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="size-8"
            :disabled="syncState === 'syncing'"
            :aria-label="syncState === 'done' ? 'Settings synced' : 'Sync settings'"
            :title="syncState === 'done' ? 'Settings synced' : 'Sync settings'"
            @click="syncSettings"
          >
            <Check v-if="syncState === 'done'" class="text-success size-3.5" />
            <RefreshCw
              v-else
              class="size-3.5"
              :class="{ 'animate-spin': syncState === 'syncing' }"
            />
          </Button>
          <Button variant="ghost" size="sm" class="gap-1.5" @click="gate.signOut()">
            <LogOut class="size-3.5" />
            Sign out
          </Button>
        </div>
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
        Go to Dashboard
        <ArrowUpRight class="size-4" />
      </Button>

      <p class="text-muted-foreground px-1 text-center text-[11px] leading-snug">
        Fill happens on the page — look for the QuikFill button near each form.
      </p>

      <a
        :href="SUPPORT_MAILTO"
        class="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 text-[11px] transition-colors"
      >
        <Mail class="size-3.5" />
        Contact support
      </a>
    </div>
  </div>
</template>
