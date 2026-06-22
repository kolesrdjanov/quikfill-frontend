<script setup lang="ts">
import { Sun, Moon, Menu, X } from 'lucide-vue-next'

const { scrolled } = useNavScroll()
const { toggle } = useTheme()

// "Add to Chrome" points at the Chrome Web Store listing (placeholder until the
// public listing exists); "Sign in" deep-links into the dashboard. Both origins
// come from runtime config so prod can override via NUXT_PUBLIC_*.
const { appUrl, chromeStoreUrl } = useRuntimeConfig().public

const links = [
  { href: '/#flow', label: 'How it works' },
  { href: '/#privacy', label: 'Privacy' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

const menuOpen = ref(false)
const close = () => (menuOpen.value = false)

// Close the sheet if the viewport grows back to desktop, or on Escape.
onMounted(() => {
  const mq = window.matchMedia('(min-width: 861px)')
  const onChange = () => mq.matches && close()
  mq.addEventListener('change', onChange)
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener('keydown', onKey)
  })
})
</script>

<template>
  <header id="nav" class="nav" :class="{ scrolled: scrolled || menuOpen }">
    <div class="wrap nav-inner">
      <NuxtLink class="brand" to="/" @click="close">
        <img src="/quikfill-icon.svg" alt="" />
        <span>Quik<span class="f">Fill</span></span>
      </NuxtLink>

      <nav class="nav-links">
        <NuxtLink v-for="l in links" :key="l.href" :to="l.href">{{ l.label }}</NuxtLink>
      </nav>

      <div class="nav-actions">
        <button
          class="theme-toggle"
          type="button"
          aria-label="Toggle light / dark theme"
          title="Toggle light / dark"
          @click="toggle"
        >
          <Sun class="t-sun" />
          <Moon class="t-moon" />
        </button>
        <a class="signin" :href="`${appUrl}/sign-in`">Sign in</a>
        <a
          class="btn btn--primary btn--sm nav-cta"
          :href="chromeStoreUrl"
          target="_blank"
          rel="noopener"
        >
          <IconChrome /> Add to Chrome
        </a>
        <button
          class="nav-toggle"
          type="button"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" />
          <Menu v-else />
        </button>
      </div>
    </div>

    <Transition name="mm">
      <nav v-if="menuOpen" id="mobile-menu" class="mobile-menu">
        <div class="wrap">
          <NuxtLink v-for="l in links" :key="l.href" :to="l.href" @click="close">{{
            l.label
          }}</NuxtLink>
          <div class="mm-cta">
            <a class="btn btn--ghost btn--lg" :href="`${appUrl}/sign-in`" @click="close">Sign in</a>
            <a
              class="btn btn--primary btn--lg"
              :href="chromeStoreUrl"
              target="_blank"
              rel="noopener"
              @click="close"
            >
              <IconChrome /> Add to Chrome — free
            </a>
          </div>
        </div>
      </nav>
    </Transition>
  </header>
</template>
