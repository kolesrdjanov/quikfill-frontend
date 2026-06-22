<script setup lang="ts">
import {
  ScanSearch,
  Shapes,
  Type,
  Mail,
  ChevronDown,
  Phone,
  Calendar,
  SquareCheck,
  Hash,
  AlignLeft,
  Dices,
  Undo2,
  Layers,
  Fingerprint,
  Check,
} from 'lucide-vue-next'

const typeChips = [
  { icon: Type, label: 'text' },
  { icon: Mail, label: 'email' },
  { icon: ChevronDown, label: 'select' },
  { icon: Phone, label: 'tel' },
  { icon: Calendar, label: 'date' },
  { icon: SquareCheck, label: 'checkbox' },
  { icon: Hash, label: 'number' },
  { icon: AlignLeft, label: 'textarea' },
]

/* b3 — generator values cycle with a fade, like the design's initGen. */
const GEN = {
  name: ['Jordan Avery', 'Mei Tanaka', 'Luis Romero', 'Priya Nair', 'Sam Okafor'],
  email: [
    'j.avery@mail.com',
    'mei.t@helios.io',
    'luis@romero.co',
    'priya@nair.dev',
    's.okafor@acme.io',
  ],
  phone: [
    '+1 415 555 0142',
    '+1 212 555 0188',
    '+44 20 7946 0991',
    '+1 650 555 0117',
    '+1 305 555 0163',
  ],
}
const genIdx = ref(0)
const genVisible = ref(true)
const genName = computed(() => GEN.name[genIdx.value % GEN.name.length])
const genEmail = computed(() => GEN.email[genIdx.value % GEN.email.length])
const genPhone = computed(() => GEN.phone[genIdx.value % GEN.phone.length])
let genTimer: ReturnType<typeof setInterval> | null = null
let genSwap: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  genTimer = setInterval(() => {
    genVisible.value = false
    genSwap = setTimeout(() => {
      genIdx.value++
      genVisible.value = true
    }, 200)
  }, 2400)
})
onBeforeUnmount(() => {
  if (genTimer) clearInterval(genTimer)
  if (genSwap) clearTimeout(genSwap)
})
</script>

<template>
  <section id="capabilities" class="bento-wrap">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="sidx">02 / CAPABILITIES</span>
        <span class="eyebrow">Under the hood</span>
        <h2>Less a form-filler.<br />More a form brain.</h2>
        <p>
          QuikFill reads structure heuristics miss, generates valid data on demand, and reaches into
          places autofill can't.
        </p>
      </div>
      <div class="bento">
        <!-- b1: sees every field -->
        <div class="tile b1 reveal ticks">
          <span class="tk1"></span><span class="tk2"></span>
          <div class="th">
            <span class="ic"><ScanSearch /></span>
            <h3>Sees every field</h3>
          </div>
          <p>
            Inputs, selects, textareas, checkboxes, radios, contenteditable — detected with labels,
            ARIA and context.
          </p>
          <div class="viz">
            <div class="viz-scan">
              <div class="scanline"></div>
              <div class="sr"><span class="lbl"></span><span class="box"></span></div>
              <div class="sr"><span class="lbl"></span><span class="box"></span></div>
              <div class="sr"><span class="lbl"></span><span class="box"></span></div>
              <div class="sr"><span class="lbl"></span><span class="box"></span></div>
            </div>
          </div>
        </div>

        <!-- b2: knows the type -->
        <div class="tile b2 reveal">
          <div class="th">
            <span class="ic"><Shapes /></span>
            <h3>Knows the type</h3>
          </div>
          <p>Every field is classified before it's filled.</p>
          <div class="viz">
            <div class="viz-types">
              <span v-for="c in typeChips" :key="c.label" class="chip">
                <component :is="c.icon" /> {{ c.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- b3: smart generators -->
        <div class="tile b3 reveal">
          <div class="th">
            <span class="ic"><Dices /></span>
            <h3>Smart generators</h3>
          </div>
          <p>Fake-but-valid people, emails and more — locale-aware and seedable for QA.</p>
          <div class="viz">
            <div class="viz-gen">
              <div class="gl">
                <span class="k">name</span
                ><span class="v" :style="{ opacity: genVisible ? 1 : 0 }">{{ genName }}</span>
              </div>
              <div class="gl">
                <span class="k">email</span
                ><span class="v" :style="{ opacity: genVisible ? 1 : 0 }">{{ genEmail }}</span>
              </div>
              <div class="gl">
                <span class="k">phone</span
                ><span class="v" :style="{ opacity: genVisible ? 1 : 0 }">{{ genPhone }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- b4: undo -->
        <div class="tile b4 reveal">
          <div class="th">
            <span class="ic"><Undo2 /></span>
            <h3>Undo anytime</h3>
          </div>
          <div class="viz">
            <div class="viz-undo">
              <div class="uf">
                <span class="uv">Jordan Avery</span><span class="ub"><Undo2 /></span>
              </div>
            </div>
          </div>
        </div>

        <!-- b5: iframes & shadow DOM -->
        <div class="tile b5 reveal">
          <div class="th">
            <span class="ic"><Layers /></span>
            <h3>iframes &amp; shadow DOM</h3>
          </div>
          <div class="viz">
            <div class="viz-frames">
              <div class="fr">
                <span class="fl">page</span>
                <div class="fr fr2">
                  <span class="fl">iframe</span>
                  <div class="fr3"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- b6: saved profiles -->
        <div class="tile b6 reveal">
          <div class="th">
            <span class="ic"><Fingerprint /></span>
            <h3>Saved profiles</h3>
          </div>
          <div class="viz">
            <div class="viz-prof">
              <div class="pr">
                careers.globex.io<span class="mt"><span class="dot"></span> matched</span>
              </div>
              <div class="pr">
                checkout.northwind<span class="mt"><Check /> reused</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
