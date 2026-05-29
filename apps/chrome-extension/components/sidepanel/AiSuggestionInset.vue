<script setup lang="ts">
import { Check, WandSparkles } from 'lucide-vue-next'
import { Button } from '@quikfill/ui'
import type { AiSuggestion } from '@quikfill/schemas'
import { pct } from '../../lib/display-maps'

defineProps<{ suggestion: AiSuggestion }>()
defineEmits<{ accept: []; reject: [] }>()
</script>

<template>
  <div class="border-warning/30 bg-warning/10 mt-2 space-y-1.5 rounded-lg border p-2.5 text-[12px]">
    <div class="text-foreground flex items-center justify-between gap-2 font-semibold">
      <span class="flex items-center gap-1.5">
        <WandSparkles class="text-warning size-3.5" />
        AI suggests <span class="text-primary">{{ suggestion.semanticType }}</span>
      </span>
      <span class="text-muted-foreground tabular-nums">{{ pct(suggestion.confidence) }}</span>
    </div>
    <ul v-if="suggestion.reasons.length" class="text-muted-foreground list-disc space-y-0.5 pl-4">
      <li v-for="(reason, i) in suggestion.reasons" :key="i">{{ reason }}</li>
    </ul>
    <div class="flex gap-2 pt-1">
      <Button size="sm" class="flex-1" @click="$emit('accept')">
        <Check class="size-3.5" />
        Accept
      </Button>
      <Button size="sm" variant="ghost" class="flex-1" @click="$emit('reject')">Reject</Button>
    </div>
  </div>
</template>
