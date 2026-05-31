<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { ProgressIndicator, ProgressRoot, type ProgressRootProps } from 'reka-ui'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<
    ProgressRootProps & {
      class?: HTMLAttributes['class']
      /** Class applied to the filled indicator — use to tint (e.g. amber/red). */
      indicatorClass?: HTMLAttributes['class']
    }
  >(),
  { modelValue: 0, max: 100 },
)

const delegated = computed(() => {
  const { class: className, indicatorClass, ...rest } = props
  void className
  void indicatorClass
  return rest
})

const percent = computed(() => {
  const value = typeof props.modelValue === 'number' ? props.modelValue : 0
  const max = props.max ?? 100
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (value / max) * 100))
})
</script>

<template>
  <ProgressRoot
    v-bind="delegated"
    :class="cn('bg-muted relative h-2 w-full overflow-hidden rounded-full', props.class)"
  >
    <ProgressIndicator
      :class="cn('bg-primary h-full w-full flex-1 transition-all', props.indicatorClass)"
      :style="`transform: translateX(-${100 - percent}%)`"
    />
  </ProgressRoot>
</template>
