<script setup lang="ts">
import type { Component } from 'vue'
import AuthOrb, { type OrbTone } from './AuthOrb.vue'

// The shared centered state used by every auth/blocking screen: severity orb +
// title + body copy, with slots for rich description and extra content (alerts,
// reference lines, forms). `align="top"` matches the sign-in / gate-lifted
// layout; the default centers the message vertically.
withDefaults(
  defineProps<{
    icon: Component
    tone?: OrbTone
    title: string
    loading?: boolean
    align?: 'center' | 'top'
  }>(),
  { tone: 'primary', align: 'center' },
)
</script>

<template>
  <div
    class="flex flex-1 flex-col items-center gap-2 px-3.5 text-center"
    :class="align === 'top' ? 'justify-start pt-6' : 'justify-center'"
  >
    <AuthOrb :icon="icon" :tone="tone" :loading="loading" />
    <h3 class="text-[17.5px] font-bold tracking-tight">{{ title }}</h3>
    <p class="text-muted-foreground m-0 max-w-[280px] text-[13px] leading-[1.5]">
      <slot name="description" />
    </p>
    <slot />
  </div>
</template>
