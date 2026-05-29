<script setup lang="ts" generic="T extends string | number | null | undefined">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<T>()

// Native select styled to match the design's `.qf-select` (custom chevron).
const arrow =
  "appearance-none bg-no-repeat bg-[right_0.9rem_center] bg-[length:16px] bg-[url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23637381'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E\")]"
</script>

<template>
  <select
    v-bind="$attrs"
    v-model="model"
    :class="
      cn(
        'border-input bg-card text-foreground focus:border-primary aria-[invalid=true]:border-destructive h-11 w-full rounded-lg border pr-9 pl-3.5 text-sm transition-colors focus:shadow-[var(--shadow-focus)] focus:outline-none',
        arrow,
        props.class,
      )
    "
  >
    <slot />
  </select>
</template>
