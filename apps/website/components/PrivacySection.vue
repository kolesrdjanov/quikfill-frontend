<script setup lang="ts">
import { MousePointerClick, HardDrive, EyeOff } from 'lucide-vue-next'
</script>

<template>
  <section id="privacy" class="section privacy">
    <div class="wrap">
      <div class="pbox">
        <div>
          <span class="eyebrow">Private by design</span>
          <h2>Nothing is read until you scan.</h2>
          <p>
            QuikFill has no access to a page until you open the panel and press scan — and your
            values stay on your device. AI only ever sees a minimised, redacted field summary.
          </p>
        </div>
        <div class="plist">
          <div class="pitem">
            <span class="ico"><MousePointerClick /></span>
            <div>
              <h4>Scan on demand</h4>
              <p>No background reading. The page is inert until you ask.</p>
            </div>
          </div>
          <div class="pitem">
            <span class="ico"><HardDrive /></span>
            <div>
              <h4>Local-first storage</h4>
              <p>Records and profiles live on your device. Sync is opt-in.</p>
            </div>
          </div>
          <div class="pitem">
            <span class="ico"><EyeOff /></span>
            <div>
              <h4>Redacted AI</h4>
              <p>Gemini receives field structure, never your raw values or full page HTML.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
