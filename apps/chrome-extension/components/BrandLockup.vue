<script setup lang="ts">
import logoUrl from '@quikfill/assets/logos/quikfill-icon.svg?url'

withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'sm' })
</script>

<template>
  <span
    class="text-foreground flex items-center gap-2 font-extrabold tracking-[-0.02em]"
    :class="size === 'md' ? 'text-[17px]' : 'text-[15px]'"
  >
    <img :src="logoUrl" alt="" :class="size === 'md' ? 'size-[30px]' : 'size-6'" />
    <span>Quik<span class="text-primary">Fill</span></span>
  </span>
</template>
