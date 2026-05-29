<script setup lang="ts">
import type { Component } from 'vue'
import { Loader2 } from 'lucide-vue-next'

export type OrbTone = 'primary' | 'danger' | 'warning' | 'info' | 'success' | 'gray'

withDefaults(defineProps<{ icon: Component; tone?: OrbTone; loading?: boolean }>(), {
  tone: 'primary',
})

// Tints mirror the @quikfill/ui Badge variants so severity reads identically
// across the extension. The 66×66 rounded-20px tile is the auth "orb".
const toneClass: Record<OrbTone, string> = {
  primary: 'bg-accent text-primary',
  danger: 'bg-destructive/15 text-destructive',
  warning: 'bg-warning/20 text-[#b7791f] dark:text-warning',
  info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success',
  gray: 'bg-muted text-muted-foreground',
}
</script>

<template>
  <div
    class="mb-2 flex size-[66px] shrink-0 items-center justify-center rounded-[20px]"
    :class="toneClass[tone]"
  >
    <Loader2 v-if="loading" class="size-[30px] animate-spin" />
    <component :is="icon" v-else class="size-[30px]" />
  </div>
</template>
