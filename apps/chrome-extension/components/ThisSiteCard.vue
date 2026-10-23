<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { Button, Label, Select, Switch } from '@quikfill/ui'
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

// Per-site activation, right in the popup. The toggle acts on the CURRENT tab's
// hostname; the mode switch flips between "all sites except exclusions" and "only
// my allowlist". Edits go through the background (requestSettingsUpdate → PATCH
// /users/me/settings when signed in), with local-first persistence. The overlay
// reacts live through storage.onChanged.
const settings = ref<ExtensionSettings>({ ...DEFAULT_EXTENSION_SETTINGS })
const hostname = ref('')
const saveError = ref('')
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

// Reflect the change optimistically (snappy toggle), then persist locally. Account sync is best-effort.
// If local storage fails, revert and explain the failure.
async function commit(next: ExtensionSettings): Promise<void> {
  const previous = settings.value
  settings.value = next
  saveError.value = ''
  const saved = await requestSettingsUpdate(next)
  if (!saved) {
    settings.value = previous
    saveError.value = 'Could not save on this device. Try again.'
  }
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
</script>

<template>
  <div class="space-y-4">
    <p v-if="saveError" role="alert" class="text-destructive text-xs">{{ saveError }}</p>
    <div class="flex items-center justify-between gap-4">
      <Label for="site-global">QuikFill enabled</Label>
      <Switch
        id="site-global"
        :model-value="settings.globalEnabled"
        aria-label="QuikFill enabled"
        @update:model-value="(v) => commit({ ...settings, globalEnabled: !!v })"
      />
    </div>
    <div v-if="hostname" class="flex items-start justify-between gap-4">
      <div class="min-w-0 space-y-1">
        <Label for="site-enabled" class="break-all">{{ hostname }}</Label>
        <p class="text-muted-foreground text-xs leading-relaxed">{{ switchHint }}</p>
      </div>
      <Switch
        id="site-enabled"
        :model-value="enabledHere"
        :aria-label="`QuikFill on ${hostname}`"
        @update:model-value="(v) => onToggle(!!v)"
      />
    </div>
    <p v-else class="text-muted-foreground text-xs">QuikFill can’t run on this page.</p>
    <div class="space-y-1.5">
      <Label for="site-mode">Where QuikFill runs</Label>
      <Select
        id="site-mode"
        :model-value="mode"
        class="min-h-11 w-full"
        aria-label="Where QuikFill runs"
        @update:model-value="(v) => onMode(String(v))"
      >
        <option value="all">Run on all sites</option>
        <option value="allowlist">Only sites I choose</option>
      </Select>
    </div>
    <div class="space-y-2">
      <p class="text-[13px] font-medium">{{ listTitle }}</p>
      <ul v-if="hosts.length" class="space-y-2">
        <li
          v-for="h in hosts"
          :key="h"
          class="bg-muted/40 flex items-center justify-between gap-2 rounded-lg px-3 py-2"
        >
          <span class="min-w-0 text-xs break-all">{{ h }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0"
            :aria-label="`Remove ${h}`"
            @click="onRemove(h)"
          >
            <X class="size-3.5" />
          </Button>
        </li>
      </ul>
      <p v-else class="text-muted-foreground text-xs leading-relaxed">{{ listEmptyHint }}</p>
    </div>
  </div>
</template>
