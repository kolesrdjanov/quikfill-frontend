<script setup lang="ts">
import type { PaginationNextProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { PaginationNext } from 'reka-ui'
import { Button } from '../button'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<PaginationNextProps & { class?: HTMLAttributes['class'] }>(),
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
  <PaginationNext v-bind="delegatedProps">
    <Button variant="outline" size="icon" :class="cn(props.class)" aria-label="Next page">
      <ChevronRight class="size-4" />
    </Button>
  </PaginationNext>
</template>
