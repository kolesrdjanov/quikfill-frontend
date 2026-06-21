<!--
  LEGACY (pre-floating-button flow) — DISABLED, kept for reuse.

  This is the original side-panel scan → preview → AI-suggestion → fill wizard.
  It is intentionally NO LONGER referenced by any entrypoint: sidepanel/main.ts
  mounts the minimal App.vue (auth + subscription settings + a single-action scan
  form). Filling now happens on the page via the content overlay (see
  entrypoints/content/overlay.ts and docs/CHROME_EXTENSION_FLOW.md).

  Do not delete — retained so the wizard (and useFillSession + the preview/AI/
  result components it drives) can be restored or harvested later.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCheck,
  ChevronDown,
  CloudOff,
  Eye,
  EyeOff,
  Focus,
  ListChecks,
  Lock,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  WandSparkles,
} from 'lucide-vue-next'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@quikfill/ui'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import PanelShell from '../../components/sidepanel/PanelShell.vue'
import SiteChip from '../../components/sidepanel/SiteChip.vue'
import EmptyState from '../../components/sidepanel/EmptyState.vue'
import FieldCard from '../../components/sidepanel/FieldCard.vue'
import PlanCard from '../../components/sidepanel/PlanCard.vue'
import ResultCard from '../../components/sidepanel/ResultCard.vue'
import LimitationsDisclosure from '../../components/sidepanel/LimitationsDisclosure.vue'
import SettingsPanel from '../../components/sidepanel/SettingsPanel.vue'
import { allowsSampleData } from '@quikfill/schemas'
import { useFillSession } from '../../lib/useFillSession'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { AI_REASON_MESSAGE } from '../../lib/display-maps'
import { useEntitlements } from '../../lib/useEntitlements'

const s = useFillSession()
const { settings, load: loadSettings } = useSettings()
const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

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
    : `${entitlements.fillsRemaining.value.toLocaleString()} AI fills left`
  return { variant, label } as const
})

// Settings live inside the panel now — no chrome:// modal. `view` swaps the body.
const view = ref<'main' | 'settings'>('main')

// The fill session only touches the page once the auth gate is lifted; resolve
// the host site lazily the first time the panel becomes usable.
let siteResolved = false
watch(
  () => gate.isAppReady.value,
  async (ready) => {
    if (ready && !siteResolved) {
      siteResolved = true
      await s.initSite()
    }
  },
  { immediate: true },
)

onMounted(async () => {
  const loaded = await loadSettings()
  initTheme(loaded.theme)
  s.hideValues.value = loaded.hideValuesByDefault
  s.autoMatch.value = loaded.autoMatchProfiles
  s.locale.value = loaded.locale
  s.allowSampleData.value = allowsSampleData(loaded.defaultFillSource)
  // The popup deep-links here by leaving a one-shot flag in session storage.
  const pending = await browser.storage.session?.get('ui:pendingView')
  if (pending?.['ui:pendingView'] === 'settings') {
    view.value = 'settings'
    await browser.storage.session?.remove('ui:pendingView')
  }
  await gate.init()
  await entitlements.init()
})

// Filling is gated when any included field still needs confirmation: clicking
// "Fill" opens a dialog listing those fields so the user explicitly OKs them
// (they often resolve to an empty/skipped value). With none flagged, fill runs
// straight away.
const confirmOpen = ref(false)
function requestFill() {
  if (s.confirmationCount.value > 0) confirmOpen.value = true
  else void s.fill()
}
function confirmFill() {
  confirmOpen.value = false
  void s.fill()
}

const ambiguousIds = computed(() => new Set(s.ambiguousFields.value.map((f) => f.id)))
const aiAvailable = computed(() => settings.value.aiEnabled)
const canAskAi = computed(
  () => s.hasAmbiguous.value && aiAvailable.value && !entitlements.isOverQuota.value,
)
const aiUnavailableMessage = computed(() =>
  s.aiError.value
    ? AI_REASON_MESSAGE[s.aiError.value.reason]
    : 'QuikFill AI is unavailable — it’s optional, you can still preview and fill.',
)

const siteInitial = computed(
  () =>
    s.hostname.value
      .replace(/^www\./, '')
      .charAt(0)
      .toUpperCase() || 'Q',
)
const fieldContext = computed(() => {
  if (!s.scanned.value || !s.fields.value.length) return undefined
  return `${s.fields.value.length} fields`
})
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
          <div class="flex items-center gap-1.5">
            <Button
              v-if="s.canGoBack.value"
              variant="ghost"
              size="icon"
              class="size-[30px]"
              aria-label="Back"
              @click="s.stepBack()"
            >
              <ArrowLeft class="size-4" />
            </Button>
            <BrandLockup />
          </div>
          <div class="flex items-center gap-1.5">
            <Badge v-if="usageChip" :variant="usageChip.variant">{{ usageChip.label }}</Badge>
            <Button
              variant="ghost"
              size="icon"
              class="size-[30px]"
              :disabled="s.syncing.value"
              aria-label="Sync now"
              @click="s.syncNow()"
            >
              <RefreshCw class="size-4" :class="{ 'animate-spin': s.syncing.value }" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-[30px]"
              :aria-label="s.hideValues.value ? 'Show values' : 'Hide values'"
              @click="s.hideValues.value = !s.hideValues.value"
            >
              <EyeOff v-if="s.hideValues.value" class="size-4" />
              <Eye v-else class="size-4" />
            </Button>
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
        <p v-if="s.syncMessage.value" class="text-muted-foreground text-[12px]">
          {{ s.syncMessage.value }}
        </p>
        <SiteChip
          :hostname="s.hostname.value || 'this page'"
          :initial="siteInitial"
          :context="fieldContext"
        />
        <DropdownMenu v-if="s.scanned.value && s.scannedScope.value">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="mt-1.5 h-7 gap-1.5 px-2 text-[12px]"
              :disabled="s.scanning.value"
              aria-label="Change scan scope"
            >
              <Focus class="text-muted-foreground size-3.5" />
              {{ s.scannedScope.value.label }}
              <ChevronDown class="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Scan scope</DropdownMenuLabel>
            <DropdownMenuItem @select="s.rescanWithScope('page')">Whole page</DropdownMenuItem>
            <DropdownMenuItem @select="s.rescanWithScope('form')">This form</DropdownMenuItem>
            <DropdownMenuItem @select="s.rescanWithScope('dialog')">This dialog</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </template>

    <!-- SETTINGS -->
    <SettingsPanel v-if="view === 'settings'" />

    <!-- PRE-SCAN -->
    <template v-else>
      <EmptyState
        v-if="s.phase.value === 'prescan'"
        :icon="ScanLine"
        title="Scan this page"
        description="Detect every field, then preview a fill plan before anything is written."
      >
        <Alert variant="info" class="text-left text-[12px]">
          <ShieldCheck />
          <div>Nothing is read until you scan. Values stay on your device.</div>
        </Alert>
      </EmptyState>

      <!-- SCANNING / FILLING -->
      <EmptyState
        v-else-if="s.phase.value === 'scanning'"
        :icon="ScanLine"
        loading
        title="Scanning…"
        description="Detecting fields and matching saved profiles."
      />
      <EmptyState
        v-else-if="s.phase.value === 'filling'"
        :icon="CheckCheck"
        loading
        title="Filling…"
        description="Writing values and verifying each field on the page."
      />

      <!-- DETECTED -->
      <template v-else-if="s.phase.value === 'detected'">
        <Alert v-if="s.matchedProfileName.value" variant="success">
          <BookmarkCheck />
          <div>
            <strong>Matched “{{ s.matchedProfileName.value }}”.</strong>
            {{ s.savedMappings.value.size }} saved
            {{ s.savedMappings.value.size === 1 ? 'mapping' : 'mappings' }} applied · by
            fingerprint.
          </div>
        </Alert>
        <Alert v-if="s.aiState.value === 'unavailable'" variant="warning">
          <CloudOff />
          <div>{{ aiUnavailableMessage }}</div>
        </Alert>
        <Alert
          v-else-if="s.aiState.value === 'ready'"
          variant="info"
          class="justify-center text-center text-[12px]"
        >
          <Lock />
          <div>Only redacted field summaries were sent — never your values.</div>
        </Alert>
        <Alert v-else-if="canAskAi" variant="info">
          <WandSparkles />
          <div>
            <strong>{{ s.ambiguousFields.value.length }} fields are ambiguous.</strong>
            Heuristics weren't confident — ask AI to classify.
          </div>
        </Alert>

        <FieldCard
          v-for="field in s.fields.value"
          :key="field.id"
          :field="field"
          :ambiguous="ambiguousIds.has(field.id)"
          :suggestion="s.aiSuggestions.value.get(field.id)"
          :accepted-type="s.aiProposals.value.get(field.id)?.semanticType"
          @accept="s.acceptSuggestion(field.id)"
          @reject="s.rejectSuggestion(field.id)"
          @remove="s.remove(field.id)"
        />

        <LimitationsDisclosure :limitations="s.limitations.value" />
      </template>

      <!-- PREVIEW -->
      <template v-else-if="s.phase.value === 'preview'">
        <Alert v-if="s.matchedProfileName.value" variant="success">
          <BookmarkCheck />
          <div>
            <strong>Matched “{{ s.matchedProfileName.value }}”.</strong>
            Saved mappings applied.
          </div>
        </Alert>
        <Alert v-if="s.confirmationCount.value" variant="warning">
          <ShieldAlert />
          <div>
            <strong>{{ s.confirmationCount.value }} fields need confirmation.</strong>
            Review before you fill.
          </div>
        </Alert>
        <Alert v-if="s.saveMessage.value" variant="success">
          <BookmarkCheck />
          <div>{{ s.saveMessage.value }}</div>
        </Alert>

        <div class="flex items-center justify-between">
          <span class="text-muted-foreground text-[12px]">
            {{ s.includedCount.value }} of {{ s.planItems.value?.length ?? 0 }} included
          </span>
          <Button variant="ghost" size="sm" @click="s.regenerate()">
            <RefreshCw class="size-3.5" />
            Regenerate
          </Button>
        </div>

        <PlanCard
          v-for="item in s.planItems.value ?? []"
          :key="item.detectedFieldId"
          :item="item"
          :excluded="s.excluded.value.has(item.detectedFieldId)"
          :hide-values="s.hideValues.value"
          :suggestion="s.aiSuggestions.value.get(item.detectedFieldId)"
          :ai-status="s.aiFieldStatus.value.get(item.detectedFieldId)"
          @toggle="s.toggle(item.detectedFieldId)"
          @cycle="s.cycleSource(item.detectedFieldId)"
          @accept="s.acceptSuggestion(item.detectedFieldId)"
          @reject="s.rejectSuggestion(item.detectedFieldId)"
          @retry="s.classifyField(item.detectedFieldId)"
          @remove="s.remove(item.detectedFieldId)"
          @open-settings="view = 'settings'"
        />

        <LimitationsDisclosure :limitations="s.limitations.value" />
      </template>

      <!-- RESULTS -->
      <template v-else-if="s.phase.value === 'results'">
        <Alert v-if="s.resultSummary.value.failed === 0" variant="success">
          <CheckCheck />
          <div>
            <strong>{{ s.resultSummary.value.filled }} filled</strong>
            <template v-if="s.resultSummary.value.skipped">
              · {{ s.resultSummary.value.skipped }} skipped</template
            >. Verified on the page.
          </div>
        </Alert>
        <Alert v-else variant="warning">
          <ShieldAlert />
          <div>
            {{ s.resultSummary.value.filled }} filled · {{ s.resultSummary.value.failed }} failed ·
            {{ s.resultSummary.value.skipped }} skipped. Some custom widgets need a manual touch.
          </div>
        </Alert>

        <template v-for="item in s.planItems.value ?? []" :key="item.detectedFieldId">
          <ResultCard
            v-if="s.resultById.value.get(item.detectedFieldId)"
            :result="s.resultById.value.get(item.detectedFieldId)!"
            :label="item.label"
            :hide-values="s.hideValues.value"
          />
        </template>

        <LimitationsDisclosure :limitations="s.limitations.value" />

        <Alert v-if="s.profileSaved.value" variant="info" class="text-[12px]">
          <BookmarkCheck />
          <div>Profile saved — next visit fills instantly.</div>
        </Alert>
      </template>

      <p v-if="s.error.value" class="text-destructive text-[13px]">{{ s.error.value }}</p>
    </template>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="`Confirm ${s.confirmationCount.value} ${s.confirmationCount.value === 1 ? 'field' : 'fields'} before filling?`"
      description="These fields couldn't be resolved to a confident value — they may be left empty or need a value you set yourself. Review them, then fill."
      :confirm-label="`Fill ${s.includedCount.value} fields`"
      cancel-label="Keep reviewing"
      variant="default"
      :pending="s.filling.value"
      @confirm="confirmFill()"
    >
      <ul class="max-h-44 space-y-1.5 overflow-y-auto text-[13px]">
        <li
          v-for="item in s.confirmationItems.value"
          :key="item.detectedFieldId"
          class="flex items-center gap-2"
        >
          <ShieldAlert class="text-warning size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate font-medium">{{ item.label }}</span>
          <span v-if="item.warnings.length" class="text-muted-foreground truncate text-[12px]">
            {{ item.warnings[0] }}
          </span>
        </li>
      </ul>
    </ConfirmDialog>

    <!-- FOOTER -->
    <template #footer>
      <template v-if="s.phase.value === 'prescan' || s.phase.value === 'scanning'">
        <Button class="w-full" :disabled="s.scanning.value" @click="s.scan()">
          <ScanLine class="size-4" />
          {{ s.scanning.value ? 'Scanning…' : 'Scan page' }}
        </Button>
      </template>

      <template v-else-if="s.phase.value === 'detected'">
        <Button class="w-full" :disabled="!s.fields.value.length" @click="s.preview()">
          <ListChecks class="size-4" />
          Preview fill
        </Button>
        <Button
          v-if="canAskAi"
          variant="outline"
          size="sm"
          class="w-full"
          :disabled="s.aiState.value === 'loading'"
          @click="s.askAi()"
        >
          <WandSparkles class="size-4" />
          {{ s.aiState.value === 'loading' ? 'Asking AI…' : 'Ask QuikFill AI' }}
        </Button>
      </template>

      <template v-else-if="s.phase.value === 'preview' || s.phase.value === 'filling'">
        <Button
          class="w-full"
          :disabled="s.filling.value || !s.includedCount.value"
          @click="requestFill()"
        >
          <CheckCheck class="size-4" />
          {{ s.filling.value ? 'Filling…' : `Fill ${s.includedCount.value} fields` }}
        </Button>
        <!-- Grid (not flex): Button's base `shrink-0` stops two `w-full` flex
             items from shrinking, so a flex row overflows to ~200% width and
             pushes "Ask AI" off-screen. Grid tracks size independently of
             flex-shrink; cols collapse to 1 when Ask AI is hidden. -->
        <div class="grid gap-2" :class="canAskAi ? 'grid-cols-2' : 'grid-cols-1'">
          <Button variant="outline" size="sm" class="w-full" @click="s.saveProfile()">
            <Bookmark class="size-4" />
            {{ s.matchedProfileId.value ? 'Update profile' : 'Save profile' }}
          </Button>
          <Button
            v-if="canAskAi"
            variant="ghost"
            size="sm"
            class="w-full"
            :disabled="s.aiState.value === 'loading'"
            @click="s.askAi()"
          >
            <WandSparkles class="size-4" />
            Ask AI
          </Button>
        </div>
      </template>

      <template v-else-if="s.phase.value === 'results'">
        <Button class="w-full" :disabled="s.scanning.value" @click="s.scan()">
          <ScanLine class="size-4" />
          Scan again
        </Button>
        <Button
          v-if="s.undoSnapshot.value"
          variant="outline"
          class="w-full"
          :disabled="s.undoing.value"
          @click="s.undo()"
        >
          <Undo2 class="size-4" />
          {{ s.undoing.value ? 'Undoing…' : 'Undo last fill' }}
        </Button>
        <Button variant="secondary" size="sm" class="w-full" @click="s.saveProfile()">
          <BookmarkCheck class="size-4" />
          {{ s.profileSaved.value ? 'Profile saved ✓' : 'Save profile' }}
        </Button>
      </template>
    </template>
  </PanelShell>
</template>
