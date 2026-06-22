<script setup lang="ts">
// Chrome Web Store listing the footer link points to (placeholder until launch).
const chromeStoreUrl = useRuntimeConfig().public.chromeStoreUrl
</script>

<template>
  <footer class="footer">
    <div class="wrap">
      <div class="footer-top">
        <div class="footer-brand">
          <NuxtLink class="brand" to="/">
            <img src="/quikfill-icon.svg" alt="" /><span>Quik<span class="f">Fill</span></span>
          </NuxtLink>
          <p>A button on every form. One click to fill it. Your data stays on your device.</p>
        </div>
        <div class="footer-cols">
          <div class="footer-col">
            <h5>Product</h5>
            <NuxtLink to="/#flow">How it works</NuxtLink>
            <NuxtLink to="/#capabilities">Capabilities</NuxtLink>
            <NuxtLink to="/#pricing">Pricing</NuxtLink>
            <NuxtLink to="/#faq">FAQ</NuxtLink>
          </div>
          <div class="footer-col">
            <h5>Company</h5>
            <NuxtLink to="/privacy">Privacy policy</NuxtLink>
            <NuxtLink to="/terms">Terms of service</NuxtLink>
            <a :href="chromeStoreUrl" target="_blank" rel="noopener">Chrome extension</a>
            <a href="mailto:hello@quikfill.io">Contact</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 QuikFill. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>
