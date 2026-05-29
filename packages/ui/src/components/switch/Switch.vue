<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class']; ariaLabel?: string }>()
const model = defineModel<boolean>()
</script>

<template>
  <input
    v-model="model"
    type="checkbox"
    role="switch"
    :aria-label="props.ariaLabel"
    :class="
      cn(
        'border-input bg-muted checked:bg-primary checked:border-primary relative h-[22px] w-[38px] shrink-0 cursor-pointer appearance-none rounded-full border transition-colors after:absolute after:top-[2px] after:left-[2px] after:size-[16px] after:rounded-full after:bg-white after:shadow-sm after:transition-transform checked:after:translate-x-[16px] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none',
        props.class,
      )
    "
  />
</template>
