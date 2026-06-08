<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ExternalLink, X } from 'lucide-vue-next'
import { Button, Card, CardHeader, CardTitle, Select, Switch } from '@quikfill/ui'
import {
  getActiveTab,
  onExtensionSettingsChange,
  readExtensionSettings,
  requestSettingsUpdate,
} from '@quikfill/browser-adapter'
import {
  DEFAULT_EXTENSION_SETTINGS,
  normalizeHostname,
  type ActivationMode,
  type ExtensionSettings,
} from '@quikfill/schemas'
import { activeHostList, isHostActive, removeActiveHost, setHostEnabled } from '../lib/overlay-gate'
import OptionRow from './options/OptionRow.vue'
import { DASHBOARD_URL } from '../lib/external-urls'

// Per-site activation, right in the popup. The toggle acts on the CURRENT tab's
// hostname; the mode switch flips between "all sites except exclusions" and "only
// my allowlist". Edits go through the background (requestSettingsUpdate → PATCH
// /users/me/settings), and the on-page overlay reacts live via storage.onChanged.
const settings = ref<ExtensionSettings>({ ...DEFAULT_EXTENSION_SETTINGS })
const hostname = ref('')
let unsubscribe: () => void = () => {}

onMounted(async () => {
  settings.value = await readExtensionSettings()
  unsubscribe = onExtensionSettingsChange((s) => (settings.value = s))
  const tab = await getActiveTab()
  hostname.value = normalizeHostname(tab.url ?? '')
})

onUnmounted(() => unsubscribe())

const mode = computed<ActivationMode>(() => settings.value.activationMode)
const enabledHere = computed(() =>
  hostname.value ? isHostActive(settings.value, hostname.value) : false,
)
const hosts = computed(() => activeHostList(settings.value))

const switchHint = computed(() => {
  if (mode.value === 'allowlist') {
    return enabledHere.value
      ? 'On your allowed list — QuikFill runs here.'
      : 'Turn on to add it to your allowed sites.'
  }
  return enabledHere.value
    ? 'QuikFill runs here. Turn off to exclude this site.'
    : 'Excluded — QuikFill stays off here.'
})
const listTitle = computed(() => (mode.value === 'allowlist' ? 'Allowed sites' : 'Excluded sites'))
const listEmptyHint = computed(() =>
  mode.value === 'allowlist'
    ? 'No sites yet — QuikFill runs nowhere until you add one.'
    : 'No exclusions — QuikFill runs on every site.',
)

// Reflect the change optimistically (snappy toggle), then persist to the account.
// On failure (offline / signed out) revert to the previous value.
async function commit(next: ExtensionSettings): Promise<void> {
  const previous = settings.value
  settings.value = next
  const saved = await requestSettingsUpdate(next)
  if (!saved) settings.value = previous
}

function onToggle(value: boolean): void {
  if (hostname.value) void commit(setHostEnabled(settings.value, hostname.value, value))
}
function onMode(value: string): void {
  void commit({ ...settings.value, activationMode: value as ActivationMode })
}
function onRemove(host: string): void {
  void commit(removeActiveHost(settings.value, host))
}
function openDashboardSetup(): void {
  void browser.tabs?.create({ url: `${DASHBOARD_URL}/settings/setup` })
  window.close()
}
</script>

<template>
  <Card>
    <CardHeader><CardTitle>This site</CardTitle></CardHeader>

    <OptionRow v-if="hostname" stacked :title="hostname" :subtitle="switchHint">
      <Switch
        :model-value="enabledHere"
        :aria-label="`QuikFill on ${hostname}`"
        @update:model-value="(v) => onToggle(!!v)"
      />
    </OptionRow>
    <div v-else class="text-muted-foreground border-b px-4 py-3.5 text-[12.5px]">
      QuikFill can’t run on this page.
    </div>

    <OptionRow stacked title="Where QuikFill runs" subtitle="Pick how sites are matched.">
      <Select
        :model-value="mode"
        class="w-full"
        aria-label="Where QuikFill runs"
        @update:model-value="(v) => onMode(String(v))"
      >
        <option value="all">Run on all sites</option>
        <option value="allowlist">Only sites I choose</option>
      </Select>
    </OptionRow>

    <div class="border-b px-4 py-3.5 last:border-b-0">
      <div class="text-[14px] font-semibold">{{ listTitle }}</div>
      <ul v-if="hosts.length" class="mt-2 flex flex-col gap-1.5">
        <li
          v-for="h in hosts"
          :key="h"
          class="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5"
        >
          <span class="truncate text-[12.5px]">{{ h }}</span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground shrink-0"
            :aria-label="`Remove ${h}`"
            @click="onRemove(h)"
          >
            <X class="size-3.5" />
          </button>
        </li>
      </ul>
      <p v-else class="text-muted-foreground mt-1 text-[12.5px]">{{ listEmptyHint }}</p>
    </div>

    <div class="px-4 py-3.5">
      <Button variant="outline" size="sm" class="w-full" @click="openDashboardSetup">
        <ExternalLink class="size-4" />
        Manage sites in dashboard
      </Button>
    </div>
  </Card>
</template>
