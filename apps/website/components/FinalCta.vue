<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'

// Chrome Web Store listing the install CTA points to (placeholder until launch).
const chromeStoreUrl = useRuntimeConfig().public.chromeStoreUrl
</script>

<template>
  <section class="section cta-final">
    <div class="wrap">
      <div class="cta-box reveal">
        <div class="grid-bg"></div>
        <h2>Never type the<br />same form twice.</h2>
        <p>
          Add QuikFill, open any form, and watch the button do the rest. Free to start — no card
          required.
        </p>
        <div class="cta-row">
          <a class="btn btn--primary btn--lg" :href="chromeStoreUrl" target="_blank" rel="noopener">
            <IconChrome /> Add to Chrome — free
          </a>
          <a class="btn btn--ghost btn--lg" href="#pricing">See pricing</a>
        </div>
        <div class="micro">
          <ShieldCheck /> Works on any site · nothing read until you click Fill
        </div>
      </div>
    </div>
  </section>
</template>
