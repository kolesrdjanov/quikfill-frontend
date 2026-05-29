<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="bg-surface flex min-h-screen flex-col items-center justify-center px-4 py-10">
    <RouterLink
      to="/"
      class="mb-8 flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight"
    >
      <span
        class="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm"
      >
        Q
      </span>
      <span>Quik<span class="text-primary">Fill</span></span>
    </RouterLink>
    <div class="w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
