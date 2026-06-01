<script setup lang="ts">
import { Chrome, ShieldCheck } from 'lucide-vue-next'
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
          <!-- Disabled until public launch:
          <a class="btn btn--primary btn--lg" href="#"><Chrome /> Add to Chrome — free</a>
          <a class="btn btn--ghost btn--lg" href="#pricing">See pricing</a>
          -->
          <span class="btn btn--primary btn--lg" aria-disabled="true"><Chrome /> Coming soon</span>
        </div>
        <div class="micro"><ShieldCheck /> Works on any site · nothing read until you scan</div>
      </div>
    </div>
  </section>
</template>
