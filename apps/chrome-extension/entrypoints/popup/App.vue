<script setup lang="ts">
function openSidePanel() {
  browser.windows?.getCurrent().then((win) => {
    if (win.id != null) browser.sidePanel?.open({ windowId: win.id })
  })
}
</script>

<template>
  <div class="bg-background text-foreground flex w-64 flex-col gap-3 p-3">
    <h1 class="text-sm font-semibold">Quikfill</h1>
    <p class="text-muted-foreground text-xs">Open the side panel to scan and fill the page.</p>
    <button
      class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm"
      @click="openSidePanel"
    >
      Open side panel
    </button>
  </div>
</template>
