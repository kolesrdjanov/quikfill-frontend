<script setup lang="ts">
import { RouterLink } from 'vue-router'
import logoUrl from '@quikfill/assets/logos/quikfill-icon.svg?url'
</script>

<template>
  <div class="bg-surface flex min-h-screen flex-col items-center justify-center px-4 py-10">
    <RouterLink
      to="https://quikfill.io"
      class="mb-8 flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight"
    >
      <img :src="logoUrl" alt="" class="size-8" />
      <span>Quik<span class="text-primary">Fill</span></span>
    </RouterLink>
    <div class="w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
