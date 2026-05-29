<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import { X } from 'lucide-vue-next'
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<DialogContentEmits>()
const delegated = computed(() => {
  const { class: className, ...rest } = props
  void className
  return rest
})
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'bg-card fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border p-6 shadow-[var(--shadow-pop)] focus:outline-none',
          props.class,
        )
      "
    >
      <slot />
      <DialogClose
        class="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-4 right-4 rounded-md p-1 transition-colors"
        aria-label="Close"
      >
        <X class="size-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
