<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ExternalLink, LogOut, ShieldCheck, Trash2 } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Toaster,
  toast,
} from '@quikfill/ui'
import { createChromeStorageAdapter, createProfileStore } from '@quikfill/browser-adapter'
import type { ExtensionSettings, ThemePref } from '@quikfill/schemas'
import OptionRow from '../options/OptionRow.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'

// In-panel preferences. Same controls as the options page, but rendered inside the
// side panel (our own surface) with stacked rows so the narrow width never truncates.
const { settings, update } = useSettings()
const { apply: applyTheme } = useExtensionTheme()
const gate = useAuthGate()
const adapter = createChromeStorageAdapter()
const store = createProfileStore(adapter)

const profileCount = ref(0)
const confirmClear = ref(false)
const clearing = ref(false)

onMounted(async () => {
  profileCount.value = (await store.listFormProfiles()).length
})

function set<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) {
  void update({ [key]: value } as Partial<ExtensionSettings>)
}

function onTheme(value: string) {
  const theme = value as ThemePref
  set('theme', theme)
  applyTheme(theme)
}

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

    <!-- FILLING -->
    <Card>
      <CardHeader><CardTitle>Filling</CardTitle></CardHeader>
      <OptionRow
        stacked
        title="Default fill source"
        subtitle="What a field with no saved mapping (and an accepted AI suggestion) fills with. Sample data is synthetic and clearly labeled."
      >
        <Select
          :model-value="settings.defaultFillSource"
          class="w-full"
          aria-label="Default fill source"
          @update:model-value="
            (v) => set('defaultFillSource', v as ExtensionSettings['defaultFillSource'])
          "
        >
          <option value="recordField">Only my saved data</option>
          <option value="hybrid">My saved data, then sample</option>
          <option value="generatorRule">Sample data</option>
          <option value="aiGenerated">Leave it for me to fill</option>
        </Select>
      </OptionRow>
      <OptionRow
        stacked
        title="Auto-match saved profiles"
        subtitle="Apply mappings on scan by fingerprint — never URL alone."
      >
        <Switch
          :model-value="settings.autoMatchProfiles"
          aria-label="Auto-match saved profiles"
          @update:model-value="(v) => set('autoMatchProfiles', !!v)"
        />
      </OptionRow>
      <OptionRow
        stacked
        title="Hide values by default"
        subtitle="Mask proposed and filled values until you reveal them."
      >
        <Switch
          :model-value="settings.hideValuesByDefault"
          aria-label="Hide values by default"
          @update:model-value="(v) => set('hideValuesByDefault', !!v)"
        />
      </OptionRow>
    </Card>

    <!-- AI -->
    <Card>
      <CardHeader><CardTitle>AI assistance</CardTitle></CardHeader>
      <OptionRow stacked :title="planName" :subtitle="planUsage">
        <Button variant="outline" size="sm" @click="openBilling">
          <ExternalLink class="size-4" />
          Manage plan
        </Button>
      </OptionRow>
      <OptionRow
        stacked
        title="QuikFill AI"
        subtitle="Send redacted field summaries to classify ambiguous fields. Never your values or full HTML."
      >
        <Switch
          :model-value="settings.aiEnabled"
          aria-label="QuikFill AI"
          @update:model-value="(v) => set('aiEnabled', !!v)"
        />
      </OptionRow>
      <OptionRow
        stacked
        title="Locale"
        subtitle="Drives generated names, addresses, and phone numbers."
      >
        <Select
          :model-value="settings.locale"
          class="w-full"
          aria-label="Locale"
          @update:model-value="(v) => set('locale', v as ExtensionSettings['locale'])"
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="sr-RS">Srpski (RS)</option>
        </Select>
      </OptionRow>
    </Card>

    <!-- APPEARANCE -->
    <Card>
      <CardHeader><CardTitle>Appearance &amp; permissions</CardTitle></CardHeader>
      <OptionRow stacked title="Theme" subtitle="Match the system or pick a theme.">
        <Tabs :model-value="settings.theme" @update:model-value="(v) => onTheme(String(v))">
          <TabsList>
            <TabsTrigger value="light">Light</TabsTrigger>
            <TabsTrigger value="auto">Auto</TabsTrigger>
            <TabsTrigger value="dark">Dark</TabsTrigger>
          </TabsList>
        </Tabs>
      </OptionRow>
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
