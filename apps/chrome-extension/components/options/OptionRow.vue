<script setup lang="ts">
// One settings row. Inline (label/description left, control right) by default for
// the wide options page; `stacked` puts the control on its own line below the text
// for narrow surfaces like the side panel, so nothing truncates or wraps awkwardly.
defineProps<{ title: string; subtitle?: string; stacked?: boolean }>()
</script>

<template>
  <div
    :class="
      stacked
        ? 'flex flex-col gap-2.5 border-b px-4 py-3.5 last:border-b-0'
        : 'flex items-center justify-between gap-4 border-b px-5 py-4 last:border-b-0'
    "
  >
    <div class="min-w-0">
      <div class="text-[14px] font-semibold">{{ title }}</div>
      <div
        v-if="subtitle"
        class="text-muted-foreground mt-0.5 text-[12.5px]"
        :class="stacked ? '' : 'max-w-[420px]'"
      >
        {{ subtitle }}
      </div>
    </div>
    <div :class="stacked ? '' : 'shrink-0'"><slot /></div>
  </div>
</template>
