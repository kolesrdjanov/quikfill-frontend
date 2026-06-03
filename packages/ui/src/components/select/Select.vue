<script setup lang="ts" generic="T extends string | number | null | undefined">
import { ChevronDown } from 'lucide-vue-next'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<T>()
</script>

<template>
  <div class="relative">
    <select
      v-bind="$attrs"
      v-model="model"
      :class="
        cn(
          'border-input bg-card text-foreground focus:border-primary aria-[invalid=true]:border-destructive h-9 w-full appearance-none rounded-lg border pr-9 pl-3.5 text-sm transition-colors focus:shadow-[var(--shadow-focus)] focus:outline-none',
          props.class,
        )
      "
    >
      <slot />
    </select>
    <ChevronDown
      class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
    />
  </div>
</template>
