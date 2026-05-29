<script setup lang="ts">
import { computed } from 'vue'
import { confidenceTone, pct } from '../../lib/display-maps'

const props = defineProps<{ confidence: number }>()

const tone = computed(() => confidenceTone(props.confidence))
const barClass = computed(
  () =>
    ({ success: 'bg-success', warning: 'bg-warning', primary: 'bg-primary' })[
      tone.value as 'success' | 'warning' | 'primary'
    ] ?? 'bg-primary',
)
const width = computed(() => `${Math.round(props.confidence * 100)}%`)
</script>

<template>
  <div class="flex flex-1 items-center gap-2">
    <div
      class="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
      role="meter"
      :aria-valuenow="Math.round(confidence * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`Confidence ${pct(confidence)}`"
    >
      <div class="h-full rounded-full transition-all" :class="barClass" :style="{ width }" />
    </div>
    <span class="text-muted-foreground text-[11px] tabular-nums">{{ pct(confidence) }}</span>
  </div>
</template>
