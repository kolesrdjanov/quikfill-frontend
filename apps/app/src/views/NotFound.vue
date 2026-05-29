<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button, Card, CardContent } from '@quikfill/ui'
</script>

<template>
  <Card>
    <CardContent class="space-y-4 py-10 text-center">
      <h1 class="text-foreground text-3xl font-bold tracking-tight">404</h1>
      <p class="text-muted-foreground text-sm">This page does not exist.</p>
      <Button as-child variant="outline" class="w-full">
        <RouterLink to="/">Back to dashboard</RouterLink>
      </Button>
    </CardContent>
  </Card>
</template>
