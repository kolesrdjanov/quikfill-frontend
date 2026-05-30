<script setup lang="ts">
import { Zap, Sun, Moon } from 'lucide-vue-next'

const { scrolled } = useNavScroll()
const { toggle } = useTheme()
</script>

<template>
  <header id="nav" class="nav" :class="{ scrolled }">
    <div class="wrap nav-inner">
      <a class="brand" href="#top">
        <img src="/quikfill-icon.svg" alt="" />
        <span>Quik<span class="f">Fill</span></span>
      </a>
      <nav class="nav-links">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#privacy">Privacy</a>
        <a href="#pricing">Pricing</a>
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
        <a class="signin" href="#">Sign in</a>
        <a class="btn btn--primary btn--sm" href="#pricing"><Zap /> Start free trial</a>
      </div>
    </div>
  </header>
</template>
