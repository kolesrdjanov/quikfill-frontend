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
import ThisSiteCard from '../../components/ThisSiteCard.vue'
import RecipesCard from '../../components/RecipesCard.vue'
import LocalFillCard from '../../components/LocalFillCard.vue'
import { SUPPORT_MAILTO } from '../../lib/external-urls'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// Local preferences are always available. Authentication is an optional route
// for AI and account sync; filling happens on the page.
const DASHBOARD_URL = import.meta.env.PROD ? 'https://app.quikfill.io' : 'http://localhost:5173'

const { init: initTheme, apply: applyTheme } = useExtensionTheme()
const gate = useAuthGate()
const showAuth = ref(false)
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

// A refresh that failed with nothing cached (offline at cold start, or a contract
// mismatch the background swallowed). Entitlements is display-only — AI gating
// treats unknown optimistically — so we degrade to a brief error + retry instead
// of hanging on "Loading your plan…" forever.
const loadError = computed(() => entitlements.loadFailed.value && !entitlements.known.value)

const planLine = computed(() => {
  if (!entitlements.known.value) return null
  const name = entitlements.planName.value ?? 'Plan'
  const status = entitlements.status.value
  return status && status !== 'active' ? `${name} · ${status}` : name
})

const usageText = computed(() => {
  if (loadError.value) return "Couldn't load your plan"
  if (!entitlements.known.value) return 'Loading your plan…'
  if (entitlements.isUnlimited.value) return 'Unlimited AI fills'
  if (entitlements.isOverQuota.value) return 'AI limit reached — resets next month'
  return `${entitlements.fillsRemaining.value.toLocaleString()} AI fills left this month`
})

const retrying = ref(false)
async function retryEntitlements(): Promise<void> {
  if (retrying.value) return
  retrying.value = true
  try {
    await entitlements.refresh()
  } finally {
    retrying.value = false
  }
}

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
})

onUnmounted(() => {
  unsubscribeSettings()
  if (doneTimer) clearTimeout(doneTimer)
})

watch(
  () => gate.isAppReady.value,
  (ready) => {
    if (ready) {
      showAuth.value = false
      void entitlements.init().then(() => entitlements.refresh())
      void syncSettings()
    }
  },
)

function showSignIn() {
  gate.showSignIn()
  showAuth.value = true
}

function openDashboard() {
  void browser.tabs?.create({ url: `${DASHBOARD_URL}/settings/billing` })
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[340px]">
    <div v-if="showAuth && !gate.isAppReady.value">
      <Button variant="ghost" class="m-2 min-h-11" @click="showAuth = false"
        >Back to local fill</Button
      >
      <AuthPanel />
    </div>

    <div v-else class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <BrandLockup />
        <div v-if="gate.isAppReady.value" class="flex items-center gap-1">
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

      <LocalFillCard />
      <RecipesCard />
      <details class="rounded-lg border">
        <summary class="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">
          Site activation and exclusions
        </summary>
        <ThisSiteCard />
      </details>

      <div
        v-if="gate.isAppReady.value"
        class="bg-muted/40 flex flex-col gap-3 rounded-[12px] border p-3.5"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold">{{ planLine ?? 'Your plan' }}</span>
          <Badge v-if="entitlements.isOverQuota.value" variant="danger">AI limit reached</Badge>
        </div>
        <p class="text-muted-foreground text-[12px]">{{ usageText }}</p>
        <Button
          v-if="loadError"
          variant="outline"
          size="sm"
          class="h-7 gap-1.5 self-start"
          :disabled="retrying"
          @click="retryEntitlements"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': retrying }" />
          Retry
        </Button>
        <div v-if="showBar" class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all"
            :class="barClass"
            :style="{ width: `${barPct}%` }"
          />
        </div>
      </div>

      <p
        v-if="gate.isAppReady.value && gate.user.value?.email"
        class="text-muted-foreground px-1 text-[11px]"
      >
        Signed in as {{ gate.user.value.email }}
      </p>

      <Button v-if="gate.isAppReady.value" class="min-h-11 w-full" @click="openDashboard">
        Go to Dashboard
        <ArrowUpRight class="size-4" />
      </Button>

      <Button v-else variant="outline" class="min-h-11 w-full" @click="showSignIn"
        >Sign in for optional AI &amp; sync</Button
      >

      <p class="text-muted-foreground px-1 text-center text-[12px] leading-snug">
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
