<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{ name?: string; class?: HTMLAttributes['class'] }>()

const initials = computed(() => {
  const parts = (props.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})
</script>

<template>
  <span
    :class="
      cn(
        'bg-accent text-accent-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
        props.class,
      )
    "
  >
    <slot>{{ initials }}</slot>
  </span>
</template>
