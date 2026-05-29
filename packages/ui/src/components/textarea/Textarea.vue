<script setup lang="ts" generic="T extends string | number | null | undefined">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<T>()
</script>

<template>
  <textarea
    v-model="model"
    :class="
      cn(
        'border-input bg-card text-foreground placeholder:text-muted-foreground/70 focus:border-primary aria-[invalid=true]:border-destructive min-h-[92px] w-full resize-y rounded-lg border px-3.5 py-3 text-sm transition-colors focus:shadow-[var(--shadow-focus)] focus:outline-none',
        props.class,
      )
    "
  />
</template>
