<script setup lang="ts">
import { Button } from '@quikfill/ui/button'

useHead({
  title: 'Quikfill — Autofill any form',
  meta: [
    {
      name: 'description',
      content: 'Quikfill scans, maps, and fills any web form. Marketing site placeholder.',
    },
  ],
})
</script>

<template>
  <main
    class="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center"
  >
    <h1 class="text-foreground text-4xl font-semibold tracking-tight sm:text-6xl">Quikfill</h1>
    <p class="text-muted-foreground mt-6 text-lg">
      Scan, map, and fill any web form. This is a placeholder landing page — Iteration 9 builds the
      real marketing site.
    </p>
    <div class="mt-10 flex gap-3">
      <Button as="a" href="#">Get the extension</Button>
      <Button as="a" href="#" variant="outline">Open dashboard</Button>
    </div>
  </main>
</template>
