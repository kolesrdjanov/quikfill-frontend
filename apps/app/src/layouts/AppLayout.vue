<script setup lang="ts">
import { RouterLink } from 'vue-router'

const nav = [
  { label: 'Home', to: '/dashboard' },
  { label: 'Data', to: '/dashboard' },
  { label: 'Generators', to: '/dashboard' },
  { label: 'Apps', to: '/dashboard' },
  { label: 'Form Profiles', to: '/dashboard' },
  { label: 'Fill History', to: '/dashboard' },
  { label: 'Subscription', to: '/dashboard' },
  { label: 'Settings', to: '/dashboard' },
]
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="bg-sidebar text-sidebar-foreground w-56 shrink-0 border-r p-4">
      <div class="text-foreground mb-6 px-2 text-lg font-semibold">Quikfill</div>
      <nav class="flex flex-col gap-1">
        <RouterLink
          v-for="item in nav"
          :key="item.label"
          :to="item.to"
          class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md px-2 py-1.5 text-sm"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="flex-1 p-6">
      <slot />
    </main>
  </div>
</template>
