<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Toaster } from '@quikfill/ui'
import AppLayout from '@/layouts/AppLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'

const route = useRoute()
const layout = computed(() => (route.meta.layout === 'app' ? AppLayout : AuthLayout))
</script>

<template>
  <component :is="layout">
    <router-view />
  </component>
  <Toaster />
</template>
