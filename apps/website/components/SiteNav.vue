<script setup lang="ts">
import { Zap, Sun, Moon } from 'lucide-vue-next'

const { scrolled } = useNavScroll()
const { toggle } = useTheme()

// Sign in deep-links into the dashboard (app.quikfill.io in prod via
// NUXT_PUBLIC_APP_URL); same origin/route the pricing free-tier CTA uses.
const appUrl = useRuntimeConfig().public.appUrl
</script>

<template>
  <header id="nav" class="nav" :class="{ scrolled }">
    <div class="wrap nav-inner">
      <NuxtLink class="brand" to="/">
        <img src="/quikfill-icon.svg" alt="" />
        <span>Quik<span class="f">Fill</span></span>
      </NuxtLink>
      <nav class="nav-links">
        <NuxtLink to="/#how">How it works</NuxtLink>
        <NuxtLink to="/#features">Features</NuxtLink>
        <NuxtLink to="/#privacy">Privacy</NuxtLink>
        <!-- Pricing hidden until public launch: <a href="#pricing">Pricing</a> -->
      </nav>
      <div class="nav-actions">
        <button
          id="themeToggle"
          class="theme-toggle"
          aria-label="Toggle theme"
          title="Toggle light / dark"
          @click="toggle"
        >
          <Sun class="t-sun" />
          <Moon class="t-moon" />
        </button>
        <a class="signin" :href="`${appUrl}/sign-in`">Sign in</a>
        <!-- Get started disabled until public launch:
        <a class="btn btn--primary btn--sm" href="#pricing"><Zap /> Get started</a>
        -->
        <span class="btn btn--primary btn--sm" aria-disabled="true"><Zap /> Coming soon</span>
      </div>
    </div>
  </header>
</template>
