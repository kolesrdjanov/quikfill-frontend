<script setup lang="ts">
import { MousePointerClick, Lock, EyeOff } from 'lucide-vue-next'
</script>

<template>
  <section id="privacy" class="section privacy">
    <div class="wrap">
      <div class="pbox">
        <div>
          <span class="eyebrow">Private by design</span>
          <h2>Nothing is read until you scan.</h2>
          <p>
            QuikFill can't see a page until you open it and press scan. What it reads from the page
            stays on your device — only a minimised, redacted field summary is ever sent to AI.
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
            <span class="ico"><Lock /></span>
            <div>
              <h4>Synced to your account</h4>
              <p>
                Your saved profiles and data sync to your private account — encrypted, never sold.
              </p>
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
