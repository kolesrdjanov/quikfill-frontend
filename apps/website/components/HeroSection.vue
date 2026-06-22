<script setup lang="ts">
import { Play, ShieldCheck } from 'lucide-vue-next'

const chromeStoreUrl = useRuntimeConfig().public.chromeStoreUrl

/* ---- kinetic rotating context word ---- */
const WORDS = ['job applications', 'checkout flows', 'CRM leads', 'QA fixtures', 'signup forms']
const activeIdx = ref(0)
const outIdx = ref(-1)
let kineticTimer: ReturnType<typeof setInterval> | null = null

/* ---- count-up stats (rendered at target for SSR / no-JS, animated on mount) ---- */
const stat1 = ref(50)
const stat2 = ref(1)

function countUp(target: number, set: (v: number) => void) {
  const start = performance.now()
  const dur = 1100
  set(0)
  function tick(now: number) {
    const p = Math.min(1, (now - start) / dur)
    set(Math.round(target * (1 - Math.pow(1 - p, 3))))
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

onMounted(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return

  countUp(50, (v) => (stat1.value = v))
  countUp(1, (v) => (stat2.value = v))

  kineticTimer = setInterval(() => {
    outIdx.value = activeIdx.value
    activeIdx.value = (activeIdx.value + 1) % WORDS.length
    setTimeout(() => (outIdx.value = -1), 520)
  }, 2200)
})
onBeforeUnmount(() => {
  if (kineticTimer) clearInterval(kineticTimer)
})
</script>

<template>
  <section id="hero" class="hero">
    <div class="hero-bg">
      <div class="hero-grid"></div>
      <div class="glow g1"></div>
      <div class="glow g2"></div>
    </div>
    <div class="wrap">
      <div class="hero-inner">
        <span class="pill reveal">
          <span class="dot"></span>
          <span class="pill-tx">New flow · a Fill button on <b>every form</b></span>
        </span>
        <h1 class="reveal" data-d="1">
          Fill any form in<br /><span class="grad-text">one click.</span>
        </h1>
        <p class="hero-ctx reveal" data-d="1">
          From
          <span class="kinetic">
            <span
              v-for="(w, i) in WORDS"
              :key="w"
              :class="{ on: i === activeIdx, out: i === outIdx }"
              >{{ w }}</span
            >
          </span>
        </p>
        <p class="sub reveal" data-d="2">
          QuikFill drops its own button next to every form you meet. Hover, hit
          <b style="color: var(--fg); font-weight: 600">Fill</b>, and AI reads the fields and fills
          them in a second — on any site, with nothing typed and nothing leaked.
        </p>
        <div class="cta-row reveal" data-d="3">
          <a class="btn btn--primary btn--lg" :href="chromeStoreUrl" target="_blank" rel="noopener">
            <IconChrome /> Add to Chrome — free
          </a>
          <a class="btn btn--ghost btn--lg" href="#flow"><Play /> See it work</a>
        </div>
        <div class="micro reveal" data-d="4">
          <ShieldCheck /> No card to start · nothing is read until you click Fill
        </div>
        <div class="hero-stats reveal" data-d="4">
          <div class="st">
            <b>{{ stat1 }}<span class="u">+</span></b
            ><span class="l">field types read</span>
          </div>
          <div class="st">
            <b>{{ stat2 }}<span class="u">s</span></b
            ><span class="l">to fill a form</span>
          </div>
          <div class="st">
            <b><span class="u">0</span></b
            ><span class="l">values ever sent</span>
          </div>
        </div>
      </div>

      <!-- the showpiece: auto-playing in-page Fill demo -->
      <div class="demo-stage reveal ticks" data-d="2">
        <span class="tk1"></span><span class="tk2"></span>
        <span class="demo-tag"><span class="dot"></span> LIVE · auto-cycling real forms</span>
        <div class="glow-under"></div>
        <ProductMock />
      </div>
    </div>
  </section>
</template>
