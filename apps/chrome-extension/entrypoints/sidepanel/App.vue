<script setup lang="ts">
import { Button } from '@quikfill/ui/button'
</script>

<template>
  <div class="bg-background text-foreground flex min-h-screen flex-col gap-4 p-4">
    <header class="space-y-1">
      <h1 class="text-lg font-semibold tracking-tight">Quikfill</h1>
      <p class="text-muted-foreground text-sm">
        Side panel shell. Scan, preview, fill, and undo land in Iterations 3–5.
      </p>
    </header>
    <Button disabled>Scan page</Button>
  </div>
</template>
