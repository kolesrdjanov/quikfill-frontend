<script setup lang="ts">
import { Zap, Play, ShieldCheck } from 'lucide-vue-next'

const stageWrap = ref<HTMLElement | null>(null)
useMockFit(stageWrap)
</script>

<template>
  <section id="hero" class="hero">
    <div class="wrap">
      <!-- Variant A: centered spotlight -->
      <div class="hero-variant v-a">
        <div class="hero-copy">
          <span class="pill"
            ><span class="dot"></span> Live on careers.globex.io · checkout.northwind.shop ·
            +anywhere</span
          >
          <h1>Fill any form in<br /><span class="grad-text">one click.</span></h1>
          <p class="sub">
            QuikFill reads the form in front of you, classifies every field with AI, and fills it
            from your saved profiles. Preview before anything is written. Verify. Undo. On any site.
          </p>
          <div class="cta-row">
            <a class="btn btn--primary btn--lg" href="#pricing"><Zap /> Get started</a>
            <a class="btn btn--ghost btn--lg" href="#how"><Play /> See it work</a>
          </div>
          <div class="micro"><ShieldCheck /> No card to start · nothing is read until you scan</div>
        </div>
        <div ref="stageWrap" class="stage-wrap" data-slot="a">
          <ProductMock />
        </div>
      </div>

      <div class="trust v-a-only">
        <span class="lbl">Fills on</span>
        <span class="host"
          ><span class="fav" style="background: #6366f1">G</span>careers.globex.io</span
        >
        <span class="host"
          ><span class="fav" style="background: #0ea5e9">N</span>checkout.northwind.shop</span
        >
        <span class="host"
          ><span class="fav" style="background: #8b5cf6">V</span>app.vertex.io</span
        >
        <span class="host"
          ><span class="fav" style="background: #13c296">S</span>crm.summit.dev</span
        >
      </div>
    </div>
  </section>
</template>
