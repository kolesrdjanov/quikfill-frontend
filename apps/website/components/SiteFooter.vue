<script setup lang="ts">
// Chrome Web Store listing the footer link points to (placeholder until launch).
const chromeStoreUrl = useRuntimeConfig().public.chromeStoreUrl
</script>

<template>
  <footer class="footer">
    <div class="wrap">
      <div class="footer-top">
        <div class="footer-brand">
          <NuxtLink class="brand" to="/"
            ><img src="/quikfill-icon.svg" alt="" /><span
              >Quik<span class="f">Fill</span></span
            ></NuxtLink
          >
          <p>
            The one-click autofill that reads the form, understands the fields, and fills it from
            your data — on any site.
          </p>
        </div>
        <div class="footer-col">
          <h5>Product</h5>
          <NuxtLink to="/#features">Features</NuxtLink>
          <NuxtLink to="/#how">How it works</NuxtLink>
          <NuxtLink to="/#pricing">Pricing</NuxtLink>
          <a :href="chromeStoreUrl" target="_blank" rel="noopener">Chrome extension</a>
        </div>
        <div class="footer-col">
          <h5>Company</h5>
          <NuxtLink to="/privacy">Privacy</NuxtLink>
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 QuikFill. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>
