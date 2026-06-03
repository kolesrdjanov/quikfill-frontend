<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ExternalLink, LogOut, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Toaster,
  toast,
} from '@quikfill/ui'
import { createChromeStorageAdapter, createProfileStore } from '@quikfill/browser-adapter'
import OptionRow from '../options/OptionRow.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'
import { DASHBOARD_URL } from '../../lib/external-urls'

// The dashboard is the source of truth for these settings: they're edited there
// and synced down by the background worker, so this panel is now a read-only
// summary that deep-links to the dashboard for changes. Local-only operations
// (sign out, clear saved data) stay actionable here.
const { settings } = useSettings()
const { apply: applyTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()
const adapter = createChromeStorageAdapter()
const store = createProfileStore(adapter)

// The dashboard origin is build-time (prod → deployed app, dev → local Vite) via
// lib/external-urls — matches the other extension deep-links (see AuthPanel).
const DASHBOARD_BILLING_URL = `${DASHBOARD_URL}/settings/billing`
const DASHBOARD_CONFIG_URL = `${DASHBOARD_URL}/settings/config`

const planName = computed(() => entitlements.planName.value ?? 'Plan')
const planUsage = computed(() => {
  if (!entitlements.known.value) return 'Manage your plan and AI usage in the dashboard.'
  if (entitlements.isUnlimited.value) return 'Unlimited AI on this plan.'
  return `${entitlements.usagePercent.value}% of this month's AI used.`
})

const FILL_SOURCE_LABEL = {
  recordField: 'Only my saved data',
  hybrid: 'My saved data, then sample',
  generatorRule: 'Sample data',
  aiGenerated: 'Leave it for me',
} as const
const LOCALE_LABEL = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'sr-RS': 'Srpski (RS)',
} as const
const THEME_LABEL = { light: 'Light', auto: 'Automatic', dark: 'Dark' } as const
const SIZE_LABEL = { sm: 'Small', md: 'Medium', lg: 'Large' } as const
const POSITION_LABEL = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
} as const

const summary = computed(() => {
  const s = settings.value
  return [
    { label: 'Status', value: s.globalEnabled ? 'On' : 'Off' },
    { label: 'Default fill source', value: FILL_SOURCE_LABEL[s.defaultFillSource] },
    { label: 'AI assistance', value: s.aiEnabled ? 'On' : 'Off' },
    { label: 'Locale', value: LOCALE_LABEL[s.locale] },
    { label: 'Theme', value: THEME_LABEL[s.theme] },
    {
      label: 'Fill button',
      value: s.showFillButton
        ? `${SIZE_LABEL[s.buttonSize]} · ${POSITION_LABEL[s.buttonPosition]}`
        : 'Hidden',
    },
    { label: 'Payment fields', value: s.fillPaymentFields ? 'Allowed' : 'Skipped' },
    { label: 'Government IDs', value: s.fillGovernmentIdFields ? 'Allowed' : 'Skipped' },
    { label: 'Skip filled fields', value: s.skipFilledFields ? 'Yes' : 'No' },
    { label: 'Blocked sites', value: String(s.blockedHostnames.length) },
  ]
})

function openConfig(): void {
  void browser.tabs?.create({ url: DASHBOARD_CONFIG_URL })
}
function openBilling(): void {
  void browser.tabs?.create({ url: DASHBOARD_BILLING_URL })
}

const profileCount = ref(0)
const confirmClear = ref(false)
const clearing = ref(false)

onMounted(async () => {
  void entitlements.init()
  profileCount.value = (await store.listFormProfiles()).length
})

// Keep the local theme in step with the synced preference (the dashboard owns it).
watch(
  () => settings.value.theme,
  (theme) => applyTheme(theme),
  { immediate: true },
)

async function clearData() {
  clearing.value = true
  try {
    const keys = await adapter.list('')
    await Promise.all(
      keys.filter((k) => /^(domain:|formProfile:|mapping:)/.test(k)).map((k) => adapter.delete(k)),
    )
    profileCount.value = 0
    confirmClear.value = false
    toast.success('All saved profiles and mappings cleared.')
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="space-y-[11px]">
    <!-- ACCOUNT -->
    <Card>
      <CardHeader><CardTitle>Account</CardTitle></CardHeader>
      <OptionRow
        stacked
        title="Signed in"
        :subtitle="gate.user.value?.email ?? 'Your QuikFill account'"
      >
        <Button variant="outline" size="sm" @click="gate.signOut()">
          <LogOut class="size-4" />
          Sign out
        </Button>
      </OptionRow>
    </Card>

    <!-- PLAN -->
    <Card>
      <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
      <OptionRow stacked :title="planName" :subtitle="planUsage">
        <Button variant="outline" size="sm" @click="openBilling">
          <ExternalLink class="size-4" />
          Manage plan
        </Button>
      </OptionRow>
    </Card>

    <!-- CONFIGURATION (read-only — managed in the dashboard) -->
    <Card>
      <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
      <CardContent class="space-y-3">
        <p class="text-muted-foreground text-sm">
          Manage how QuikFill behaves and looks from your dashboard — changes sync here
          automatically.
        </p>
        <Button variant="outline" size="sm" class="w-full" @click="openConfig">
          <SlidersHorizontal class="size-4" />
          Open configuration
        </Button>
        <dl class="divide-y text-sm">
          <div
            v-for="row in summary"
            :key="row.label"
            class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
          >
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="font-medium">{{ row.value }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <!-- PRIVACY -->
    <Card>
      <CardHeader><CardTitle>Privacy</CardTitle></CardHeader>
      <OptionRow
        stacked
        title="Host access"
        subtitle="QuikFill only reads a page after you click — never in the background."
      >
        <Badge variant="success"><ShieldCheck /> On click only</Badge>
      </OptionRow>
    </Card>

    <!-- DATA -->
    <Card>
      <CardHeader><CardTitle>Data</CardTitle></CardHeader>
      <OptionRow
        stacked
        title="Saved profiles &amp; records"
        :subtitle="`${profileCount} saved ${profileCount === 1 ? 'profile' : 'profiles'}. Manage details in the QuikFill dashboard.`"
      >
        <Button variant="outline" size="sm" disabled>
          <ExternalLink class="size-4" />
          Manage
        </Button>
      </OptionRow>
      <OptionRow
        stacked
        title="Clear all data"
        subtitle="Remove every saved profile, domain, and mapping from this device."
      >
        <Button variant="destructive" size="sm" @click="confirmClear = true">
          <Trash2 class="size-4" />
          Clear
        </Button>
      </OptionRow>
    </Card>

    <ConfirmDialog
      v-model:open="confirmClear"
      title="Clear all saved data?"
      description="Every saved profile, domain, and field mapping on this device will be removed. This cannot be undone."
      confirm-label="Clear everything"
      :pending="clearing"
      @confirm="clearData"
    />
    <Toaster />
  </div>
</template>
