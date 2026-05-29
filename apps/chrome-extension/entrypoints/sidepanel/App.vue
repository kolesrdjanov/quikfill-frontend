<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@quikfill/ui/button'
import {
  createChromeStorageAdapter,
  createProfileStore,
  getActiveTab,
  getActiveTabId,
  requestFill,
  requestScan,
  requestUndo,
} from '@quikfill/browser-adapter'
import {
  buildPreviewPlan,
  matchMappings,
  matchProfiles,
  type MatchableProfile,
} from '@quikfill/autofill-core'
import type {
  DetectedField,
  FieldMapping,
  FillInstruction,
  FillPlanItem,
  FillResult,
  ScanLimitation,
  UndoSnapshot,
} from '@quikfill/schemas'

const store = createProfileStore(createChromeStorageAdapter())

const scanning = ref(false)
const scanned = ref(false)
const error = ref<string | null>(null)
const fields = ref<DetectedField[]>([])
const limitations = ref<ScanLimitation[]>([])
const structureHash = ref<string>('')

const planItems = ref<FillPlanItem[] | null>(null)
const excluded = ref<Set<string>>(new Set())
const seed = ref('seed-1')

const filling = ref(false)
const undoing = ref(false)
const results = ref<FillResult[] | null>(null)
const undoSnapshot = ref<UndoSnapshot | null>(null)

const matchedProfileId = ref<string | null>(null)
const matchedProfileName = ref<string | null>(null)
const savedMappings = ref<Map<string, FieldMapping>>(new Map())
const mappingByFieldId = ref<Map<string, FieldMapping>>(new Map())
const saveMessage = ref<string | null>(null)

const includedCount = computed(
  () => planItems.value?.filter((i) => !excluded.value.has(i.detectedFieldId)).length ?? 0,
)
const resultById = computed(() => {
  const map = new Map<string, FillResult>()
  for (const r of results.value ?? []) map.set(r.detectedFieldId, r)
  return map
})

async function withActiveTab<T>(fn: (tabId: number) => Promise<T>): Promise<T> {
  const tabId = await getActiveTabId()
  if (tabId == null) throw new Error('No active tab.')
  return fn(tabId)
}

function resetMatch() {
  matchedProfileId.value = null
  matchedProfileName.value = null
  savedMappings.value = new Map()
  mappingByFieldId.value = new Map()
}

async function matchSavedProfile() {
  resetMatch()
  const tab = await getActiveTab()
  if (!tab.url) return
  const hostname = safeHostname(tab.url)
  const [profiles, domains] = await Promise.all([store.listFormProfiles(), store.listDomains()])
  const hostnamesByDomain = new Map(domains.map((d) => [d.id, d.hostnames]))
  const candidates: MatchableProfile[] = profiles.map((p) => ({
    profile: p,
    hostnames: hostnamesByDomain.get(p.domainId) ?? [],
  }))
  const ranked = matchProfiles(candidates, {
    hostname,
    url: tab.url,
    pageTitle: tab.title,
    fieldFingerprintHash: structureHash.value,
    structureHash: structureHash.value,
    fieldCount: fields.value.length,
  })
  const best = ranked[0]
  if (!best) return

  const profile = profiles.find((p) => p.id === best.formProfileId)
  matchedProfileId.value = best.formProfileId
  matchedProfileName.value = profile?.name ?? 'Saved profile'

  const mappings = await store.listMappings(best.formProfileId)
  const matched = matchMappings(fields.value, mappings)
  const byFingerprint = new Map<string, FieldMapping>()
  const byField = new Map<string, FieldMapping>()
  for (const [fieldId, match] of matched) {
    byField.set(fieldId, match.mapping)
    byFingerprint.set(match.mapping.fieldFingerprint, match.mapping)
  }
  savedMappings.value = byFingerprint
  mappingByFieldId.value = byField
}

async function scan() {
  scanning.value = true
  error.value = null
  planItems.value = null
  results.value = null
  undoSnapshot.value = null
  saveMessage.value = null
  try {
    const result = await withActiveTab((tabId) => requestScan(tabId))
    fields.value = result.fields
    limitations.value = result.limitations
    structureHash.value = result.structureHash ?? ''
    scanned.value = true
    await matchSavedProfile()
  } catch {
    error.value =
      'Could not scan this page. Open the panel from the toolbar icon, then reload the page so the content script is active.'
    fields.value = []
    limitations.value = []
    resetMatch()
  } finally {
    scanning.value = false
  }
}

function preview() {
  excluded.value = new Set()
  results.value = null
  undoSnapshot.value = null
  saveMessage.value = null
  planItems.value = buildPreviewPlan(fields.value, {
    seed: seed.value,
    savedMappings: savedMappings.value,
  }).items
}

function regenerate() {
  seed.value = `seed-${Math.floor(Math.random() * 1e9)}`
  results.value = null
  undoSnapshot.value = null
  planItems.value = buildPreviewPlan(fields.value, {
    seed: seed.value,
    savedMappings: savedMappings.value,
  }).items
}

function toggle(id: string) {
  const next = new Set(excluded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  excluded.value = next
}

function includedItems(): FillPlanItem[] {
  return (planItems.value ?? []).filter((i) => !excluded.value.has(i.detectedFieldId))
}

function buildInstructions(): FillInstruction[] {
  const byId = new Map(fields.value.map((f) => [f.id, f]))
  return includedItems().map((i) => {
    const f = byId.get(i.detectedFieldId)
    return {
      detectedFieldId: i.detectedFieldId,
      selectorCandidates: f?.selectorCandidates ?? [],
      frame: f?.frame ?? 'main',
      shadow: f?.shadow ?? false,
      tagName: f?.tagName ?? 'input',
      inputType: f?.inputType ?? 'text',
      fillStrategy: i.fillStrategy,
      proposedValue: i.proposedValue,
    }
  })
}

async function fill() {
  filling.value = true
  error.value = null
  try {
    const response = await withActiveTab((tabId) => requestFill(tabId, buildInstructions()))
    results.value = response.results
    undoSnapshot.value = response.undoSnapshot
    await bumpSuccessfulMappings(response.results)
  } catch {
    error.value = 'Fill failed. Reload the page and try again.'
  } finally {
    filling.value = false
  }
}

async function bumpSuccessfulMappings(fillResults: FillResult[]) {
  const profileId = matchedProfileId.value
  if (!profileId) return
  const now = new Date().toISOString()
  await Promise.all(
    fillResults
      .filter((r) => r.status === 'success')
      .map((r) => {
        const mapping = mappingByFieldId.value.get(r.detectedFieldId)
        if (!mapping) return Promise.resolve()
        return store.touchMapping(profileId, mapping.id, {
          lastSuccessfulFillAt: now,
          confidence: Math.min(1, (mapping.confidence ?? 0) + 0.05),
        })
      }),
  )
}

async function undo() {
  if (!undoSnapshot.value) return
  undoing.value = true
  error.value = null
  try {
    await withActiveTab((tabId) => requestUndo(tabId, undoSnapshot.value!))
    results.value = null
    undoSnapshot.value = null
  } catch {
    error.value = 'Undo failed.'
  } finally {
    undoing.value = false
  }
}

async function saveProfile() {
  saveMessage.value = null
  try {
    const tab = await getActiveTab()
    if (!tab.url) throw new Error('No tab URL.')
    const hostname = safeHostname(tab.url)
    const name = tab.title || hostname

    let domainId: string
    let profileId: string
    if (matchedProfileId.value) {
      const existing = await store.getFormProfile(matchedProfileId.value)
      profileId = existing?.id ?? crypto.randomUUID()
      domainId = existing?.domainId ?? crypto.randomUUID()
    } else {
      domainId = crypto.randomUUID()
      profileId = crypto.randomUUID()
      await store.saveDomain({ id: domainId, name: hostname, hostnames: [hostname] })
    }

    await store.saveFormProfile({
      id: profileId,
      domainId,
      name,
      urlPatterns: [`${safeOrigin(tab.url)}/*`],
      pageTitlePatterns: tab.title ? [tab.title] : [],
      fieldFingerprintHash: structureHash.value,
      structureMetadata: { fieldCount: fields.value.length, structureHash: structureHash.value },
    })

    const byId = new Map(fields.value.map((f) => [f.id, f]))
    for (const item of includedItems()) {
      const f = byId.get(item.detectedFieldId)
      if (!f) continue
      await store.saveMapping({
        id: crypto.randomUUID(),
        formProfileId: profileId,
        fieldFingerprint: f.domFingerprint,
        selectorCandidates: f.selectorCandidates,
        target: {
          selectorCandidates: f.selectorCandidates,
          fieldFingerprint: f.domFingerprint,
          frame: f.frame,
          shadow: f.shadow,
        },
        fillSource: item.fillSource,
        fillStrategy: item.fillStrategy,
        confidence: item.confidence,
      })
    }

    matchedProfileId.value = profileId
    matchedProfileName.value = name
    saveMessage.value = `Saved profile "${name}".`
  } catch {
    error.value = 'Could not save the profile.'
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
function pct(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}
function statusClass(status: FillResult['status']) {
  if (status === 'success') return 'text-green-600'
  if (status === 'failed') return 'text-destructive'
  return 'text-muted-foreground'
}
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col gap-4 p-4">
    <header class="space-y-1">
      <h1 class="text-lg font-semibold tracking-tight">Quikfill</h1>
      <p class="text-muted-foreground text-sm">Scan, preview, fill, and save reusable profiles.</p>
    </header>

    <div class="flex flex-wrap gap-2">
      <Button :disabled="scanning" @click="scan">
        {{ scanning ? 'Scanning…' : 'Scan page' }}
      </Button>
      <Button v-if="scanned && !error && fields.length" variant="outline" @click="preview">
        Preview fill
      </Button>
      <Button v-if="planItems && !results" :disabled="filling || !includedCount" @click="fill">
        {{ filling ? 'Filling…' : `Fill ${includedCount} field${includedCount === 1 ? '' : 's'}` }}
      </Button>
      <Button v-if="planItems" variant="outline" @click="saveProfile">
        {{ matchedProfileId ? 'Update profile' : 'Save profile' }}
      </Button>
      <Button v-if="undoSnapshot" :disabled="undoing" variant="outline" @click="undo">
        {{ undoing ? 'Undoing…' : 'Undo' }}
      </Button>
    </div>

    <p v-if="matchedProfileName" class="text-muted-foreground text-xs">
      Matched saved profile: <span class="font-medium">{{ matchedProfileName }}</span> ({{
        savedMappings.size
      }}
      mapping{{ savedMappings.size === 1 ? '' : 's' }} applied)
    </p>
    <p v-if="saveMessage" class="text-xs text-green-600">{{ saveMessage }}</p>
    <p v-if="error" class="text-destructive text-sm">{{ error }}</p>

    <!-- Detected fields (before preview) -->
    <section v-if="scanned && !error && !planItems" class="space-y-3">
      <p class="text-muted-foreground text-xs">
        {{ fields.length }} field{{ fields.length === 1 ? '' : 's' }} detected
      </p>
      <ul class="space-y-2">
        <li
          v-for="field in fields"
          :key="field.id"
          class="border-border rounded-md border p-2 text-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium">{{
              field.labelText || field.name || field.domId || field.id
            }}</span>
            <span class="text-muted-foreground shrink-0 text-xs">{{ field.inputType }}</span>
          </div>
          <div class="text-muted-foreground mt-1 truncate text-xs">
            <span v-if="field.currentValue">value: {{ field.currentValue }}</span>
            <span v-else>empty</span>
            <span v-if="!field.visible"> · hidden</span>
            <span v-if="field.required"> · required</span>
          </div>
        </li>
      </ul>
    </section>

    <!-- Preview plan + fill results -->
    <section v-if="planItems" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground text-xs">
          <span v-if="results">Fill results</span>
          <span v-else>{{ includedCount }} of {{ planItems.length }} included</span>
        </p>
        <Button v-if="!results" size="sm" variant="ghost" @click="regenerate">Regenerate</Button>
      </div>

      <ul class="space-y-2">
        <li
          v-for="item in planItems"
          :key="item.detectedFieldId"
          class="border-border rounded-md border p-2 text-sm"
          :class="excluded.has(item.detectedFieldId) ? 'opacity-50' : ''"
        >
          <div class="flex items-start justify-between gap-2">
            <label class="flex items-center gap-2 font-medium">
              <input
                v-if="!results"
                type="checkbox"
                :checked="!excluded.has(item.detectedFieldId)"
                @change="toggle(item.detectedFieldId)"
              />
              {{ item.label }}
            </label>
            <span
              v-if="resultById.get(item.detectedFieldId)"
              class="shrink-0 text-xs"
              :class="statusClass(resultById.get(item.detectedFieldId)!.status)"
            >
              {{ resultById.get(item.detectedFieldId)!.status }}
            </span>
            <span v-else class="text-muted-foreground shrink-0 text-xs">
              {{ item.fillSource.sourceType }} · {{ pct(item.confidence) }}
            </span>
          </div>

          <div class="mt-1 text-xs">
            <span class="text-muted-foreground">{{ item.currentValue || 'empty' }}</span>
            <span class="text-muted-foreground"> → </span>
            <span class="font-mono">{{ item.proposedValue || '—' }}</span>
          </div>

          <p
            v-if="resultById.get(item.detectedFieldId)?.reason"
            class="text-muted-foreground mt-1 text-xs"
          >
            {{ resultById.get(item.detectedFieldId)!.reason }}
          </p>
          <ul v-else-if="item.warnings.length" class="text-destructive mt-1 space-y-0.5 text-xs">
            <li v-for="(w, i) in item.warnings" :key="i">{{ w }}</li>
          </ul>
        </li>
      </ul>

      <div v-if="limitations.length" class="space-y-1">
        <p class="text-xs font-medium">Limitations</p>
        <ul class="text-muted-foreground space-y-0.5 text-xs">
          <li v-for="(limit, i) in limitations" :key="i">{{ limit.detail }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>
