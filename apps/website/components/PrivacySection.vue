<script setup lang="ts">
import { ShieldCheck, EyeOff, X, HardDrive, MousePointerClick } from 'lucide-vue-next'

const points = [
  {
    icon: MousePointerClick,
    title: 'On-demand only',
    body: 'No background reading. Nothing happens until you click Fill on a specific form.',
  },
  {
    icon: EyeOff,
    title: 'Redacted to the AI',
    body: 'Gemini sees field labels, types and structure — never your saved values and never raw page HTML.',
  },
  {
    icon: HardDrive,
    title: 'Local-first storage',
    body: 'Your records and profiles live on your device. Chrome access is sandboxed to one isolated layer.',
  },
]
</script>

<template>
  <section id="privacy" class="section privacy">
    <div class="wrap">
      <div class="privacy-grid">
        <div class="privacy-visual reveal">
          <div class="shield">
            <div class="r1 sring"></div>
            <div class="r2 sring"></div>
            <div class="r3 sring"></div>
            <div class="core"><ShieldCheck /></div>
          </div>
          <span class="tag t1"><EyeOff /> raw HTML never sent</span>
          <span class="tag t2"><X /> values never sent</span>
          <span class="tag t3"><HardDrive /> stored on your device</span>
        </div>
        <div>
          <div class="section-head reveal">
            <span class="sidx">03 / PRIVACY</span>
            <span class="eyebrow teal">Private by design</span>
            <h2>The page is inert<br />until you press Fill.</h2>
            <p>
              QuikFill does nothing with a form until you act. When you fill, only a redacted field
              summary leaves your device — never your values, never the page's HTML.
            </p>
          </div>
          <div class="plist">
            <div v-for="(p, i) in points" :key="p.title" class="pitem reveal" :data-d="i + 1">
              <span class="ic"><component :is="p.icon" /></span>
              <div>
                <h4>{{ p.title }}</h4>
                <p>{{ p.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
