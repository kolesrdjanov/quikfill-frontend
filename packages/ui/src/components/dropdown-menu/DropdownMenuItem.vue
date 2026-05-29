<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import type { DropdownMenuItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<
  DropdownMenuItemProps & { class?: HTMLAttributes['class']; variant?: 'default' | 'danger' }
>()
</script>

<template>
  <DropdownMenuItem
    :disabled="props.disabled"
    :class="
      cn(
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors outline-none [&_svg]:size-4',
        props.variant === 'danger' &&
          'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
