<script setup lang="ts">
import { Toaster } from 'vue-sonner'
</script>

<template>
  <Toaster
    position="bottom-right"
    :duration="3500"
    :toast-options="{
      class: 'rounded-xl border bg-card text-foreground shadow-[var(--shadow-pop)]',
    }"
  />
</template>
