<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@quikfill/ui/button'
</script>

<template>
  <div class="space-y-4 text-center">
    <h1 class="text-foreground text-3xl font-semibold tracking-tight">404</h1>
    <p class="text-muted-foreground text-sm">This page does not exist.</p>
    <Button as-child variant="outline">
      <RouterLink to="/dashboard">Back to dashboard</RouterLink>
    </Button>
  </div>
</template>
