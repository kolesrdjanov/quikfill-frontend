<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<boolean>()
</script>

<template>
  <input
    v-model="model"
    type="checkbox"
    :class="
      cn(
        'border-input bg-card checked:border-primary checked:bg-primary relative size-[19px] shrink-0 cursor-pointer appearance-none rounded-[5px] border-[1.5px] transition-colors after:absolute after:top-[2.5px] after:left-[6px] after:hidden after:h-[9px] after:w-[5px] after:rotate-45 after:border-r-2 after:border-b-2 after:border-white checked:after:block',
        props.class,
      )
    "
  />
</template>
