<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@quikfill/ui/button'
</script>

<template>
  <div class="space-y-6 text-center">
    <div class="space-y-1">
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">Sign in to Quikfill</h1>
      <p class="text-muted-foreground text-sm">
        Auth shell placeholder — magic-link sign-in lands with backend integration (Iteration 10).
      </p>
    </div>
    <Button as-child class="w-full">
      <RouterLink to="/dashboard">Continue to dashboard</RouterLink>
    </Button>
  </div>
</template>
