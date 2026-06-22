<script setup lang="ts">
// Scroll-reveals and the cursor-tracking card glow are page-wide behaviours, set
// up once here after all sections have mounted.
useReveal()
useCursorGlow()
</script>

<template>
  <div>
    <SiteNav />
    <main id="top">
      <HeroSection />
      <FlowSection />
      <CapabilitiesSection />
      <PrivacySection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </main>
    <SiteFooter />
  </div>
</template>
