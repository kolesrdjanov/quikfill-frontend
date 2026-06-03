<script setup lang="ts" generic="T extends string | number | null | undefined">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ class?: HTMLAttributes['class']; type?: string }>()
const model = defineModel<T>()
const slots = useSlots()

const base =
  'h-9 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:bg-muted aria-[invalid=true]:border-destructive'
</script>

<template>
  <div v-if="slots.icon" class="relative">
    <span
      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 flex -translate-y-1/2 items-center [&_svg]:size-4"
    >
      <slot name="icon" />
    </span>
    <input
      v-bind="$attrs"
      v-model="model"
      :type="type ?? 'text'"
      :class="cn(base, 'pl-10', props.class)"
    />
  </div>
  <input
    v-else
    v-bind="$attrs"
    v-model="model"
    :type="type ?? 'text'"
    :class="cn(base, props.class)"
  />
</template>
