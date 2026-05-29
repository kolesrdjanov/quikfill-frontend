<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@quikfill/ui'
import type { FillResult } from '@quikfill/schemas'
import { STATUS_META, mask } from '../../lib/display-maps'

const props = defineProps<{ result: FillResult; label: string; hideValues?: boolean }>()

const meta = computed(() => STATUS_META[props.result.status])
</script>

<template>
  <div class="bg-card rounded-[11px] border p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] font-semibold">
        <component :is="meta.icon" class="size-[15px] shrink-0" :class="meta.iconClass" />
        <span class="truncate">{{ label }}</span>
      </span>
      <Badge :variant="meta.tone">{{ result.status }}</Badge>
    </div>
    <div v-if="result.status === 'success' && result.acceptedValue" class="mt-2 text-[12px]">
      <span class="bg-accent text-foreground rounded-md px-1.5 py-0.5 font-mono font-semibold">
        {{ mask(result.acceptedValue, !!hideValues) }}
      </span>
    </div>
    <p v-else-if="result.reason" class="text-muted-foreground mt-1.5 text-[12px]">
      {{ result.reason }}
    </p>
  </div>
</template>
