<script setup lang="ts">
import { TabsTrigger, useForwardProps } from 'reka-ui'
import type { TabsTriggerProps } from 'reka-ui'
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes['class'] }>()
const delegated = computed(() => {
  const { class: className, ...rest } = props
  void className
  return rest
})
const forwarded = useForwardProps(delegated)
</script>

<template>
  <TabsTrigger
    v-bind="forwarded"
    :class="
      cn(
        'text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-primary cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors data-[state=active]:shadow-[var(--shadow-card)]',
        props.class,
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
