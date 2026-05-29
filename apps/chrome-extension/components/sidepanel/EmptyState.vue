<script setup lang="ts">
import type { Component } from 'vue'
import { Loader2 } from 'lucide-vue-next'

defineProps<{ icon: Component; title: string; description: string; loading?: boolean }>()
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
    <div
      class="bg-accent text-primary mb-1.5 flex size-[72px] items-center justify-center rounded-[22px]"
    >
      <Loader2 v-if="loading" class="size-8 animate-spin" />
      <component :is="icon" v-else class="size-8" />
    </div>
    <h3 class="text-[16.5px] font-bold tracking-tight">{{ title }}</h3>
    <p class="text-muted-foreground max-w-[250px] text-[13px]">{{ description }}</p>
    <div class="mt-3 w-full"><slot /></div>
  </div>
</template>
