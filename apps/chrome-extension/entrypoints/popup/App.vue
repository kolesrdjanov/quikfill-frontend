<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Database, PanelRightOpen, ScanLine, Settings } from 'lucide-vue-next'
import { Badge, Button } from '@quikfill/ui'
import { createChromeStorageAdapter, createProfileStore } from '@quikfill/browser-adapter'
import BrandLockup from '../../components/BrandLockup.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'

const { load: loadSettings } = useSettings()
const { init: initTheme } = useExtensionTheme()
const store = createProfileStore(createChromeStorageAdapter())

const profileCount = ref(0)
const domainCount = ref(0)

const dataSummary = () => {
  if (!profileCount.value) return 'No saved profiles yet'
  const p = `${profileCount.value} profile${profileCount.value === 1 ? '' : 's'}`
  const d = `${domainCount.value} domain${domainCount.value === 1 ? '' : 's'}`
  return `${p} · ${d}`
}

onMounted(async () => {
  const loaded = await loadSettings()
  initTheme(loaded.theme)
  const [profiles, domains] = await Promise.all([store.listFormProfiles(), store.listDomains()])
  profileCount.value = profiles.length
  domainCount.value = domains.length
})

async function openSidePanel() {
  const win = await browser.windows?.getCurrent()
  if (win?.id != null) await browser.sidePanel?.open({ windowId: win.id })
  window.close()
}

// Open the side panel and have it land on the in-panel settings view — no chrome:// modal.
async function openSettings() {
  const win = await browser.windows?.getCurrent()
  if (win?.id != null) await browser.sidePanel?.open({ windowId: win.id })
  await browser.storage.session?.set({ 'ui:pendingView': 'settings' })
  window.close()
}

function openOptions() {
  browser.runtime.openOptionsPage?.()
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[290px]">
    <div class="bg-card flex items-center justify-between border-b px-4 py-3">
      <BrandLockup />
      <Badge variant="success">Ready</Badge>
    </div>

    <div class="flex flex-col gap-3 p-4">
      <Button class="w-full" @click="openSidePanel">
        <PanelRightOpen class="size-4" />
        Open side panel
      </Button>

      <hr class="border-border" />

      <button
        type="button"
        class="hover:bg-muted flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors"
        @click="openSidePanel"
      >
        <ScanLine class="text-muted-foreground size-[17px]" />
        <span>
          <span class="block text-[13px] font-semibold">Quick scan</span>
          <span class="text-muted-foreground block text-[11px]">Detect fields on this page</span>
        </span>
      </button>

      <button
        type="button"
        class="hover:bg-muted flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors"
        @click="openOptions"
      >
        <Database class="text-muted-foreground size-[17px]" />
        <span>
          <span class="block text-[13px] font-semibold">My data</span>
          <span class="text-muted-foreground block text-[11px]">{{ dataSummary() }}</span>
        </span>
      </button>

      <button
        type="button"
        class="hover:bg-muted flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors"
        @click="openSettings"
      >
        <Settings class="text-muted-foreground size-[17px]" />
        <span>
          <span class="block text-[13px] font-semibold">Settings</span>
          <span class="text-muted-foreground block text-[11px]">Preferences in the side panel</span>
        </span>
      </button>
    </div>
  </div>
</template>
