<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@quikfill/ui/button'
import { getActiveTabId, requestScan } from '@quikfill/browser-adapter'
import { buildPreviewPlan } from '@quikfill/autofill-core'
import type { DetectedField, FillPlanItem, ScanLimitation } from '@quikfill/schemas'

const scanning = ref(false)
const scanned = ref(false)
const error = ref<string | null>(null)
const fields = ref<DetectedField[]>([])
const limitations = ref<ScanLimitation[]>([])

const planItems = ref<FillPlanItem[] | null>(null)
const excluded = ref<Set<string>>(new Set())
const seed = ref('seed-1')

const includedCount = computed(
  () => planItems.value?.filter((i) => !excluded.value.has(i.detectedFieldId)).length ?? 0,
)

async function scan() {
  scanning.value = true
  error.value = null
  planItems.value = null
  try {
    const tabId = await getActiveTabId()
    if (tabId == null) throw new Error('No active tab to scan.')
    const result = await requestScan(tabId)
    fields.value = result.fields
    limitations.value = result.limitations
    scanned.value = true
  } catch {
    error.value =
      'Could not scan this page. Open the panel from the toolbar icon, then reload the page so the content script is active.'
    fields.value = []
    limitations.value = []
  } finally {
    scanning.value = false
  }
}

function preview() {
  excluded.value = new Set()
  planItems.value = buildPreviewPlan(fields.value, { seed: seed.value }).items
}

function regenerate() {
  seed.value = `seed-${Math.floor(Math.random() * 1e9)}`
  planItems.value = buildPreviewPlan(fields.value, { seed: seed.value }).items
}

function toggle(id: string) {
  const next = new Set(excluded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  excluded.value = next
}

function pct(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col gap-4 p-4">
    <header class="space-y-1">
      <h1 class="text-lg font-semibold tracking-tight">Quikfill</h1>
      <p class="text-muted-foreground text-sm">
        Scan the page, then preview a fill plan. Nothing is written to the page yet.
      </p>
    </header>

    <div class="flex gap-2">
      <Button :disabled="scanning" @click="scan">
        {{ scanning ? 'Scanning…' : 'Scan page' }}
      </Button>
      <Button v-if="scanned && !error && fields.length" variant="outline" @click="preview">
        Preview fill
      </Button>
    </div>

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

    <!-- Preview plan -->
    <section v-if="planItems" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground text-xs">
          {{ includedCount }} of {{ planItems.length }} field{{ planItems.length === 1 ? '' : 's' }}
          included
        </p>
        <Button size="sm" variant="ghost" @click="regenerate">Regenerate</Button>
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
                type="checkbox"
                :checked="!excluded.has(item.detectedFieldId)"
                @change="toggle(item.detectedFieldId)"
              />
              {{ item.label }}
            </label>
            <span class="text-muted-foreground shrink-0 text-xs">
              {{ item.fillSource.sourceType }} · {{ pct(item.confidence) }}
            </span>
          </div>

          <div class="mt-1 text-xs">
            <span class="text-muted-foreground">{{ item.currentValue || 'empty' }}</span>
            <span class="text-muted-foreground"> → </span>
            <span class="font-mono">{{ item.proposedValue || '—' }}</span>
          </div>

          <ul v-if="item.warnings.length" class="text-destructive mt-1 space-y-0.5 text-xs">
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
