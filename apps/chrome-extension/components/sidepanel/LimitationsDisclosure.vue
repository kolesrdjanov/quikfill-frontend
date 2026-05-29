<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, TriangleAlert } from 'lucide-vue-next'
import type { ScanLimitation } from '@quikfill/schemas'
import { LIMITATION_META } from '../../lib/display-maps'

const props = defineProps<{ limitations: ScanLimitation[] }>()
const open = ref(false)
</script>

<template>
  <div v-if="props.limitations.length" class="border-border rounded-[10px] border border-dashed">
    <button
      type="button"
      class="text-foreground flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold"
      :aria-expanded="open"
      @click="open = !open"
    >
      <TriangleAlert class="text-warning size-4" />
      {{ props.limitations.length }} scan
      {{ props.limitations.length === 1 ? 'limitation' : 'limitations' }}
      <ChevronDown
        class="text-muted-foreground ml-auto size-4 transition-transform"
        :class="open && 'rotate-180'"
      />
    </button>
    <ul v-if="open" class="space-y-2 px-3 pb-3">
      <li v-for="(limit, i) in props.limitations" :key="i" class="flex gap-2 text-[12px]">
        <component
          :is="LIMITATION_META[limit.kind].icon"
          class="text-muted-foreground mt-0.5 size-4 shrink-0"
        />
        <span>
          <span class="text-foreground font-semibold">{{ LIMITATION_META[limit.kind].label }}</span>
          <span class="text-muted-foreground"> — {{ limit.detail }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
