<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@quikfill/ui/button'
import { getActiveTabId, requestScan } from '@quikfill/browser-adapter'
import type { DetectedField, ScanLimitation } from '@quikfill/schemas'

const scanning = ref(false)
const scanned = ref(false)
const error = ref<string | null>(null)
const fields = ref<DetectedField[]>([])
const limitations = ref<ScanLimitation[]>([])

async function scan() {
  scanning.value = true
  error.value = null
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
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col gap-4 p-4">
    <header class="space-y-1">
      <h1 class="text-lg font-semibold tracking-tight">Quikfill</h1>
      <p class="text-muted-foreground text-sm">Scan the current page to inspect detected fields.</p>
    </header>

    <Button :disabled="scanning" @click="scan">
      {{ scanning ? 'Scanning…' : 'Scan page' }}
    </Button>

    <p v-if="error" class="text-destructive text-sm">{{ error }}</p>

    <section v-if="scanned && !error" class="space-y-3">
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
            <span v-if="field.shadow"> · shadow</span>
          </div>
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
