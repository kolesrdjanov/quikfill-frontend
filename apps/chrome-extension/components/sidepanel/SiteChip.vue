<script setup lang="ts">
defineProps<{ hostname: string; initial: string; context?: string }>()
</script>

<template>
  <div class="text-muted-foreground mt-[11px] flex items-center gap-2 text-[12.5px]">
    <span
      class="bg-accent text-primary inline-flex size-4 items-center justify-center rounded-[5px] text-[9px] font-extrabold uppercase"
    >
      {{ initial }}
    </span>
    <span class="text-foreground font-mono">{{ hostname }}</span>
    <span v-if="context">· {{ context }}</span>
  </div>
</template>
