<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import type { FillSourceType } from '@quikfill/schemas'
import { SOURCE_META } from '../../lib/display-maps'

const props = defineProps<{ sourceType: FillSourceType }>()
defineEmits<{ cycle: [] }>()

const meta = computed(() => SOURCE_META[props.sourceType])
</script>

<template>
  <button
    type="button"
    class="border-border bg-card text-foreground hover:border-primary inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
    :title="`Source: ${meta.label} — click to change`"
    @click="$emit('cycle')"
  >
    <component :is="meta.icon" class="size-3" />
    {{ meta.short }}
    <ChevronDown class="text-muted-foreground size-3" />
  </button>
</template>
