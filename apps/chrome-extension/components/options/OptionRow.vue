<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0">
    <div class="min-w-0">
      <div class="text-[14px] font-semibold">{{ title }}</div>
      <div v-if="subtitle" class="text-muted-foreground mt-0.5 max-w-[420px] text-[12.5px]">
        {{ subtitle }}
      </div>
    </div>
    <div class="shrink-0"><slot /></div>
  </div>
</template>
