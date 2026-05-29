<script setup lang="ts">
import { TabsList } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <TabsList :class="cn('bg-muted inline-flex gap-0.5 rounded-lg p-1', props.class)">
    <slot />
  </TabsList>
</template>
