<script setup lang="ts">
import type { PaginationFirstProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ChevronsLeft } from 'lucide-vue-next'
import { PaginationFirst } from 'reka-ui'
import { Button } from '../button'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<PaginationFirstProps & { class?: HTMLAttributes['class'] }>(),
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
  <PaginationFirst v-bind="delegatedProps">
    <Button variant="outline" size="icon" :class="cn(props.class)" aria-label="First page">
      <ChevronsLeft class="size-4" />
    </Button>
  </PaginationFirst>
</template>
