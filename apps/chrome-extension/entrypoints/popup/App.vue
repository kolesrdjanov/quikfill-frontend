<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue'
import {
  CircleHelp,
  CreditCard,
  Database,
  LogIn,
  Lock,
  PanelRightOpen,
  ScanLine,
  Settings,
  TriangleAlert,
} from 'lucide-vue-next'
import { Button } from '@quikfill/ui'
import { createChromeStorageAdapter, createProfileStore } from '@quikfill/browser-adapter'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthStatusBadge from '../../components/auth/AuthStatusBadge.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'

const HELP_URL = 'http://localhost:5173/'

const { load: loadSettings } = useSettings()
const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const store = createProfileStore(createChromeStorageAdapter())

const profileCount = ref(0)
const domainCount = ref(0)

const dataSummary = () => {
  if (!profileCount.value) return 'No saved profiles yet'
  const p = `${profileCount.value} profile${profileCount.value === 1 ? '' : 's'}`
  const d = `${domainCount.value} domain${domainCount.value === 1 ? '' : 's'}`
  return `${p} · ${d}`
}

// The popup never hosts the auth form — it points at the side panel and varies
// its tinted message by the gate's current screen.
type Tone = 'primary' | 'warning' | 'danger'
interface GatedMessage {
  tone: Tone
  icon: Component
  text: string
  action: string
  actionIcon: Component
}

const toneBox: Record<Tone, string> = {
  primary: 'bg-accent',
  warning: 'bg-warning/15',
  danger: 'bg-destructive/10',
}
const toneIcon: Record<Tone, string> = {
  primary: 'text-primary',
  warning: 'text-[#b7791f] dark:text-warning',
  danger: 'text-destructive',
}

const gatedMessage = computed<GatedMessage>(() => {
  switch (gate.screen.value) {
    case 'subscription':
      return {
        tone: 'warning',
        icon: CreditCard,
        text: 'Plan paused. Filling is off until your subscription is active.',
        action: 'Open side panel',
        actionIcon: PanelRightOpen,
      }
    case 'error':
    case 'offline':
    case 'update':
    case 'ratelimit':
      return {
        tone: 'danger',
        icon: TriangleAlert,
        text: 'QuikFill is unavailable. Open the panel to see what to do next.',
        action: 'Open side panel',
        actionIcon: PanelRightOpen,
      }
    default:
      return {
        tone: 'primary',
        icon: Lock,
        text: 'Sign in to use QuikFill. Filling is only available to signed-in accounts.',
        action: 'Sign in in the side panel',
        actionIcon: LogIn,
      }
  }
})

onMounted(async () => {
  const loaded = await loadSettings()
  initTheme(loaded.theme)
  await gate.init()
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

function openHelp() {
  void browser.tabs?.create({ url: HELP_URL })
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[290px]">
    <div class="bg-card flex items-center justify-between border-b px-4 py-3">
      <BrandLockup />
      <AuthStatusBadge :screen="gate.screen.value" />
    </div>

    <!-- SIGNED IN — the full launcher -->
    <div v-if="gate.isAppReady.value" class="flex flex-col gap-3 p-4">
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

    <!-- GATED — point at the side panel -->
    <div v-else class="flex flex-col gap-2 p-[13px]">
      <div
        class="flex gap-2.5 rounded-[10px] p-[11px] text-[12.5px] leading-snug"
        :class="toneBox[gatedMessage.tone]"
      >
        <component
          :is="gatedMessage.icon"
          class="mt-0.5 size-4 shrink-0"
          :class="toneIcon[gatedMessage.tone]"
        />
        <span>{{ gatedMessage.text }}</span>
      </div>

      <Button class="w-full" @click="openSidePanel">
        <component :is="gatedMessage.actionIcon" class="size-4" />
        {{ gatedMessage.action }}
      </Button>

      <button
        type="button"
        class="hover:bg-muted flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors"
        @click="openHelp"
      >
        <CircleHelp class="text-muted-foreground size-[17px]" />
        <span>
          <span class="block text-[13px] font-semibold">Help & privacy</span>
          <span class="text-muted-foreground block text-[11px]"
            >How QuikFill handles your data</span
          >
        </span>
      </button>
    </div>
  </div>
</template>
