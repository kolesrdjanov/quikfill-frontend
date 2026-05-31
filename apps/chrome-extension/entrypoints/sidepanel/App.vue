<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, MousePointerClick, ScanLine, Settings, ShieldCheck } from 'lucide-vue-next'
import { Alert, Badge, Button } from '@quikfill/ui'
import { getActiveTab, getActiveTabId, requestScan } from '@quikfill/browser-adapter'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import PanelShell from '../../components/sidepanel/PanelShell.vue'
import SiteChip from '../../components/sidepanel/SiteChip.vue'
import EmptyState from '../../components/sidepanel/EmptyState.vue'
import SettingsPanel from '../../components/sidepanel/SettingsPanel.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// The side-panel surface is now auth + subscription settings + a single-action
// scan form. Filling moved onto the page: the content overlay injects a floating
// "Fill" button near each form's submit. The legacy scan→preview→AI→fill wizard
// lives in App.legacy.vue (disabled, unreferenced). See docs/CHROME_EXTENSION_FLOW.md.
const { load: loadSettings } = useSettings()
const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

const view = ref<'main' | 'settings'>('main')
const hostname = ref('')
const scanning = ref(false)
const fieldCount = ref<number | null>(null)
const scopeLabel = ref<string | undefined>(undefined)
const scanError = ref<string | null>(null)

/** Compact AI-budget chip for the header; null for unlimited / unknown plans. */
const usageChip = computed(() => {
  if (!entitlements.known.value || entitlements.isUnlimited.value) return null
  const variant = entitlements.isOverQuota.value
    ? 'danger'
    : entitlements.isNearQuota.value
      ? 'warning'
      : 'gray'
  const label = entitlements.isOverQuota.value
    ? 'AI limit reached'
    : `≈ ${entitlements.fillsRemaining.value.toLocaleString()} AI fills left`
  return { variant, label } as const
})

const siteInitial = computed(
  () =>
    hostname.value
      .replace(/^www\./, '')
      .charAt(0)
      .toUpperCase() || 'Q',
)
const scanContext = computed(() =>
  fieldCount.value === null ? undefined : `${fieldCount.value} fields`,
)

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// Resolve the host site lazily the first time the panel becomes usable.
let siteResolved = false
watch(
  () => gate.isAppReady.value,
  async (ready) => {
    if (ready && !siteResolved) {
      siteResolved = true
      try {
        const tab = await getActiveTab()
        hostname.value = safeHostname(tab.url ?? '')
      } catch {
        hostname.value = ''
      }
    }
  },
  { immediate: true },
)

onMounted(async () => {
  const loaded = await loadSettings()
  initTheme(loaded.theme)
  // The popup deep-links here by leaving a one-shot flag in session storage.
  const pending = await browser.storage.session?.get('ui:pendingView')
  if (pending?.['ui:pendingView'] === 'settings') {
    view.value = 'settings'
    await browser.storage.session?.remove('ui:pendingView')
  }
  await gate.init()
  await entitlements.init()
})

// Single-action scan: report how many fillable fields are on the page. The actual
// fill is triggered on the page itself via the overlay's floating buttons.
async function scan() {
  scanning.value = true
  scanError.value = null
  try {
    const tabId = await getActiveTabId()
    if (tabId === undefined) throw new Error('No active tab')
    const result = await requestScan(tabId, { includeHidden: false, scope: 'auto' })
    fieldCount.value = result.fields.length
    scopeLabel.value = result.scope?.label
  } catch (e) {
    console.error('[quikfill] scan request failed:', e)
    scanError.value =
      'Could not scan this page. Reload the page so the content script is active, then try again.'
    fieldCount.value = null
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <AuthPanel v-if="!gate.isAppReady.value" />

  <PanelShell v-else :show-footer="view === 'main'">
    <template #header>
      <!-- SETTINGS HEADER -->
      <div v-if="view === 'settings'" class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class="size-[30px]"
          aria-label="Back"
          @click="view = 'main'"
        >
          <ArrowLeft class="size-4" />
        </Button>
        <span class="text-[15px] font-semibold">Preferences</span>
      </div>

      <!-- MAIN HEADER -->
      <template v-else>
        <div class="flex items-center justify-between">
          <BrandLockup />
          <div class="flex items-center gap-1.5">
            <Badge v-if="usageChip" :variant="usageChip.variant">{{ usageChip.label }}</Badge>
            <Button
              variant="ghost"
              size="icon"
              class="size-[30px]"
              aria-label="Settings"
              @click="view = 'settings'"
            >
              <Settings class="size-4" />
            </Button>
          </div>
        </div>
        <SiteChip
          :hostname="hostname || 'this page'"
          :initial="siteInitial"
          :context="scanContext"
        />
      </template>
    </template>

    <!-- SETTINGS -->
    <SettingsPanel v-if="view === 'settings'" />

    <!-- MAIN: in-page fill explainer + single-action scan -->
    <template v-else>
      <EmptyState
        :icon="MousePointerClick"
        title="Fill happens on the page"
        description="Look for the QuikFill button near each form’s submit button. Hover it and click “Fill” — QuikFill fills every field for you."
      >
        <Alert variant="info" class="text-left text-[12px]">
          <ShieldCheck />
          <div>Only redacted field metadata is sent — never your values or the page HTML.</div>
        </Alert>
      </EmptyState>

      <Alert v-if="fieldCount !== null && !scanError" variant="success" class="text-[12px]">
        <ScanLine />
        <div>
          <strong>{{ fieldCount }} fillable {{ fieldCount === 1 ? 'field' : 'fields' }}</strong>
          detected<template v-if="scopeLabel"> in {{ scopeLabel }}</template
          >. Use the on-page Fill button to fill them.
        </div>
      </Alert>

      <p v-if="scanError" class="text-destructive text-[13px]">{{ scanError }}</p>
    </template>

    <!-- FOOTER: single-action scan -->
    <template #footer>
      <Button class="w-full" :disabled="scanning" @click="scan()">
        <ScanLine class="size-4" />
        {{ scanning ? 'Scanning…' : 'Scan this page' }}
      </Button>
    </template>
  </PanelShell>
</template>
