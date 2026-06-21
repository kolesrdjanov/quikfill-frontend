<script setup lang="ts">
import { Chrome, ShieldCheck } from 'lucide-vue-next'

// Chrome Web Store listing the install CTA points to (placeholder until launch).
const chromeStoreUrl = useRuntimeConfig().public.chromeStoreUrl
</script>

<template>
  <section class="section cta-final">
    <div class="wrap">
      <div class="cta-box">
        <h2>Never type the<br />same form twice.</h2>
        <p>
          Add QuikFill, open your next form, and click Fill once — watch the whole thing complete.
          Free to start, no card required.
        </p>
        <div class="cta-row">
          <a class="btn btn--primary btn--lg" :href="chromeStoreUrl" target="_blank" rel="noopener"
            ><Chrome /> Add to Chrome — free</a
          >
          <a class="btn btn--ghost btn--lg" href="#pricing">See pricing</a>
        </div>
        <div class="micro"><ShieldCheck /> Works on any site · nothing read until you scan</div>
      </div>
    </div>
  </section>
</template>
