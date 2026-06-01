<script setup lang="ts">
import { ScanLine, Sparkles, Eye, CheckCheck } from 'lucide-vue-next'
</script>

<template>
  <section id="how" class="section how">
    <div class="wrap">
      <div class="section-head center">
        <span class="eyebrow">How it works</span>
        <h2>Four steps. About a second.</h2>
        <p>
          Sign in once with your email — no password. After that, QuikFill never touches a page
          until you ask: it reads the page on your device and shows you everything before it writes
          a thing.
        </p>
      </div>
      <div class="steps">
        <div class="step">
          <span class="num"><ScanLine /><span>1</span></span>
          <h3>Scan</h3>
          <p>
            Open QuikFill and scan. It reads every input, label, placeholder and ARIA hint — even
            inside same-origin iframes and open shadow DOM.
          </p>
        </div>
        <div class="step">
          <span class="num"><Sparkles /><span>2</span></span>
          <h3>Match &amp; classify</h3>
          <p>
            Saved profiles match first. Heuristics catch the obvious. Gemini classifies anything
            ambiguous and proposes a source.
          </p>
        </div>
        <div class="step">
          <span class="num"><Eye /><span>3</span></span>
          <h3>Preview</h3>
          <p>
            See the proposed value, source and confidence for every field. Nothing is written to the
            page yet — edit or reject anything.
          </p>
        </div>
        <div class="step">
          <span class="num"><CheckCheck /><span>4</span></span>
          <h3>Fill &amp; verify</h3>
          <p>
            One click fills natively, dispatches real events, and verifies each value landed.
            Changed your mind? Undo the whole run.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
