<script setup lang="ts">
import type { PaginationEllipsisProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
import { PaginationEllipsis } from 'reka-ui'
import { cn } from '../../lib/utils'

const props = defineProps<PaginationEllipsisProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _class, ...rest } = props
  void _class
  return rest
})
</script>

<template>
  <PaginationEllipsis
    v-bind="delegatedProps"
    :class="cn('flex size-9 items-center justify-center', props.class)"
  >
    <slot><MoreHorizontal class="size-4" /></slot>
  </PaginationEllipsis>
</template>
