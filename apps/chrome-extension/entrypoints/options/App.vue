<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ExternalLink, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-vue-next'
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
import BrandLockup from '../../components/BrandLockup.vue'
import OptionRow from '../../components/options/OptionRow.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'

const { settings, update, load } = useSettings()
const { init: initTheme, apply: applyTheme, isDark } = useExtensionTheme()
const adapter = createChromeStorageAdapter()
const store = createProfileStore(adapter)

const profileCount = ref(0)
const confirmClear = ref(false)
const clearing = ref(false)

onMounted(async () => {
  const loaded = await load()
  initTheme(loaded.theme)
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

function toggleHeaderTheme() {
  const next: ThemePref = isDark.value ? 'light' : 'dark'
  onTheme(next)
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
  <div class="bg-surface text-foreground min-h-screen">
    <header class="bg-card border-b">
      <div class="mx-auto flex max-w-[720px] items-center justify-between px-6 py-4">
        <BrandLockup size="md" />
        <Button variant="outline" size="icon" aria-label="Toggle theme" @click="toggleHeaderTheme">
          <Moon v-if="isDark" class="size-4" />
          <Sun v-else class="size-4" />
        </Button>
      </div>
    </header>

    <main class="mx-auto max-w-[720px] space-y-6 px-6 py-8">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Preferences</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Local-first settings for scanning, filling, and AI assistance.
        </p>
      </div>

      <!-- FILLING -->
      <Card>
        <CardHeader><CardTitle>Filling</CardTitle></CardHeader>
        <OptionRow
          title="Default fill source"
          subtitle="What Quikfill proposes when no saved mapping exists."
        >
          <Select
            :model-value="settings.defaultFillSource"
            class="w-[200px]"
            aria-label="Default fill source"
            @update:model-value="
              (v) => set('defaultFillSource', v as ExtensionSettings['defaultFillSource'])
            "
          >
            <option value="hybrid">Hybrid (record → generator)</option>
            <option value="recordField">Saved record</option>
            <option value="generatorRule">Generator preset</option>
            <option value="aiGenerated">Ask AI</option>
          </Select>
        </OptionRow>
        <OptionRow
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
        <OptionRow
          title="Quikfill AI"
          subtitle="Send redacted field summaries to classify ambiguous fields. Never your values or full HTML."
        >
          <Switch
            :model-value="settings.aiEnabled"
            aria-label="Quikfill AI"
            @update:model-value="(v) => set('aiEnabled', !!v)"
          />
        </OptionRow>
        <OptionRow title="Locale" subtitle="Drives generated names, addresses, and phone numbers.">
          <Select
            :model-value="settings.locale"
            class="w-[200px]"
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
        <OptionRow title="Theme" subtitle="Match the system or pick a theme.">
          <Tabs :model-value="settings.theme" @update:model-value="(v) => onTheme(String(v))">
            <TabsList>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="auto">Auto</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
            </TabsList>
          </Tabs>
        </OptionRow>
        <OptionRow
          title="Host access"
          subtitle="Quikfill only reads a page after you click — never in the background."
        >
          <Badge variant="success"><ShieldCheck /> On click only</Badge>
        </OptionRow>
      </Card>

      <!-- DATA -->
      <Card>
        <CardHeader><CardTitle>Data</CardTitle></CardHeader>
        <OptionRow
          title="Saved profiles &amp; records"
          :subtitle="`${profileCount} saved ${profileCount === 1 ? 'profile' : 'profiles'}. Manage details in the Quikfill dashboard.`"
        >
          <Button variant="outline" size="sm" disabled>
            <ExternalLink class="size-4" />
            Manage
          </Button>
        </OptionRow>
        <OptionRow
          title="Clear all data"
          subtitle="Remove every saved profile, domain, and mapping from this device."
        >
          <Button variant="destructive" size="sm" @click="confirmClear = true">
            <Trash2 class="size-4" />
            Clear
          </Button>
        </OptionRow>
      </Card>
    </main>

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
