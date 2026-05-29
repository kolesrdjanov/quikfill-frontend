<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuPortal, useForwardPropsEmits } from 'reka-ui'
import type { DropdownMenuContentEmits, DropdownMenuContentProps } from 'reka-ui'
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = withDefaults(
  defineProps<DropdownMenuContentProps & { class?: HTMLAttributes['class'] }>(),
  { align: 'end', sideOffset: 6 },
)
const emits = defineEmits<DropdownMenuContentEmits>()
const delegated = computed(() => {
  const { class: className, ...rest } = props
  void className
  return rest
})
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      v-bind="forwarded"
      :class="
        cn(
          'bg-popover text-popover-foreground z-50 min-w-[10rem] overflow-hidden rounded-lg border p-1.5 shadow-[var(--shadow-pop)]',
          props.class,
        )
      "
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
