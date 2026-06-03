<script setup lang="ts">
import type { PaginationPrevProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import { PaginationPrev } from 'reka-ui'
import { Button } from '../button'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<PaginationPrevProps & { class?: HTMLAttributes['class'] }>(),
  {
    asChild: true,
  },
)

const delegatedProps = computed(() => {
  const { class: _class, ...rest } = props
  void _class
  return rest
})
</script>

<template>
  <PaginationPrev v-bind="delegatedProps">
    <Button variant="outline" size="icon" :class="cn(props.class)" aria-label="Previous page">
      <ChevronLeft class="size-4" />
    </Button>
  </PaginationPrev>
</template>
