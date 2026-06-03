<script setup lang="ts">
import type { PaginationLastProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { ChevronsRight } from 'lucide-vue-next'
import { PaginationLast } from 'reka-ui'
import { Button } from '../button'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<PaginationLastProps & { class?: HTMLAttributes['class'] }>(),
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
  <PaginationLast v-bind="delegatedProps">
    <Button variant="outline" size="icon" :class="cn(props.class)" aria-label="Last page">
      <ChevronsRight class="size-4" />
    </Button>
  </PaginationLast>
</template>
