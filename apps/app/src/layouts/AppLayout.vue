<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ChevronDown,
  CreditCard,
  LogOut,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  User,
  Users,
} from 'lucide-vue-next'
import { Avatar, Button } from '@quikfill/ui'
import logoUrl from '@quikfill/assets/logos/quikfill-icon.svg?url'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark, toggle } = useTheme()

// Admin-only nav, rendered in its own section when the user has admin rights.
// Add future admin screens (e.g. Analytics) here.
const adminNav = [{ label: 'Beta Users', to: '/admin/beta-users', icon: Users }]

// Settings group, pinned to the bottom block — Billing lives here now. The full
// dashboard nav (Home, Data, Generators, …) stays disabled alongside its routes
// in `router/index.ts`; restore both together to bring it back. The group
// auto-expands while the user is anywhere under /settings/*.
const settingsNav = [
  { label: 'Billing', to: '/settings/billing', icon: CreditCard },
  { label: 'Account', to: '/settings/account', icon: User },
  { label: 'Configuration', to: '/settings/config', icon: SlidersHorizontal },
]

const inSettings = computed(() => route.path.startsWith('/settings'))
const settingsOpen = ref(inSettings.value)
watch(inSettings, (active) => {
  if (active) settingsOpen.value = true
})

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
        <template v-if="auth.user?.isAdmin">
          <div
            class="text-muted-foreground mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase"
          >
            Admin
          </div>
          <RouterLink
            v-for="item in adminNav"
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
        </template>
      </nav>

      <div class="mt-auto flex flex-col gap-0.5 border-t pt-3">
        <button
          type="button"
          :aria-expanded="settingsOpen"
          aria-controls="settings-subnav"
          :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            inSettings
              ? 'text-foreground'
              : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
          ]"
          @click="settingsOpen = !settingsOpen"
        >
          <Settings class="size-[18px]" />
          <span>Settings</span>
          <ChevronDown
            class="ml-auto size-4 transition-transform"
            :class="settingsOpen ? 'rotate-180' : ''"
          />
        </button>

        <div v-show="settingsOpen" id="settings-subnav" class="flex flex-col gap-0.5">
          <RouterLink
            v-for="item in settingsNav"
            :key="item.to"
            :to="item.to"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            :class="[
              'flex items-center gap-3 rounded-lg py-2 pr-3 pl-9 text-sm font-medium transition-colors',
              isActive(item.to)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
            ]"
          >
            <component :is="item.icon" class="size-[18px]" />
            {{ item.label }}
          </RouterLink>
        </div>

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
