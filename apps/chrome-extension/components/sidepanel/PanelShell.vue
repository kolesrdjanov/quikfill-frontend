<script setup lang="ts">
// Three fixed regions for the side panel: header, scrollable body, footer.
// Content is provided via the #header, default, and #footer slots.
// `showFooter` lets a surface suppress the footer bar entirely (e.g. settings view).
withDefaults(defineProps<{ showFooter?: boolean }>(), { showFooter: true })
</script>

<template>
  <div class="bg-background text-foreground flex h-full flex-col">
    <header class="bg-card border-b px-[15px] py-[13px]">
      <slot name="header" />
    </header>

    <div class="flex flex-1 flex-col gap-[11px] overflow-y-auto p-[14px]">
      <slot />
    </div>

    <footer
      v-if="showFooter && $slots.footer"
      class="bg-card flex flex-col gap-2 border-t px-[14px] py-3"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>
