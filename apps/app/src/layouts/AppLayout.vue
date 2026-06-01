<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { CreditCard, LogOut, Moon, Sun } from 'lucide-vue-next'
import { Avatar, Button } from '@quikfill/ui'
import logoUrl from '@quikfill/assets/logos/quikfill-icon.svg?url'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark, toggle } = useTheme()

// Trimmed to the billing-only surface. The full dashboard nav (Home, Data,
// Generators, Apps, Form Profiles, Fill History, Settings) is disabled alongside
// its routes in `router/index.ts`; restore both together to bring it back.
const nav = [{ label: 'Billing', to: '/billing', icon: CreditCard }]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

const title = computed(() => (route.meta.title as string | undefined) ?? 'QuikFill')

const displayName = computed(() => {
  const user = auth.user
  if (!user) return 'Account'
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  return name || user.email || 'Account'
})

async function signOut(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'sign-in' })
}
</script>

<template>
  <div class="bg-surface flex min-h-screen">
    <aside class="bg-sidebar flex w-60 shrink-0 flex-col border-r px-3.5 py-4">
      <RouterLink
        to="/"
        class="flex items-center gap-2.5 px-2 pb-4 text-base font-extrabold tracking-tight"
      >
        <img :src="logoUrl" alt="" class="size-7" />
        <span>Quik<span class="text-primary">Fill</span></span>
      </RouterLink>

      <nav class="flex flex-col gap-0.5">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive(item.to)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
              : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
          ]"
        >
          <component :is="item.icon" class="size-[18px]" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="mt-auto flex flex-col gap-0.5 border-t pt-3">
        <div class="mt-1 flex items-center gap-2.5 px-1 py-1.5">
          <Avatar :name="displayName" class="size-9" />
          <div class="min-w-0">
            <div class="truncate text-[13px] leading-tight font-semibold">{{ displayName }}</div>
            <div class="text-muted-foreground truncate text-[11px]">{{ auth.user?.email }}</div>
          </div>
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="bg-background flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6"
      >
        <h1 class="text-lg font-bold tracking-tight">{{ title }}</h1>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggle"
          >
            <Moon v-if="isDark" class="size-[18px]" />
            <Sun v-else class="size-[18px]" />
          </Button>
          <Button variant="outline" size="sm" @click="signOut">
            <LogOut class="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
