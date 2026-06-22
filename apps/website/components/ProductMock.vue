<script setup lang="ts">
import { Check, Lock } from 'lucide-vue-next'

/**
 * The hero showpiece: a browser-window mock that auto-plays QuikFill's in-page
 * Fill flow and loops through three real-world forms. Ported from the design's
 * `app.js` (renderScene / runScene / demoLoop) into a Vue state machine.
 *
 * The flow per scene: render the form empty → the floating Fill button fades in
 * next to the form's submit → a fake cursor glides over and taps it → the button
 * goes busy → fields fill top-to-bottom with a sweep highlight + source badge →
 * the button turns teal "Filled" and the browser pulses → hold → swap to the next
 * scene. Pauses when scrolled offscreen; reduced motion renders one filled scene.
 */
interface SceneField {
  label: string
  req?: boolean
  val: string
  src: 'saved' | 'ai'
  wide?: boolean
  area?: boolean
}
interface Scene {
  fav: { t: string; c: string }
  url: string
  logo: { t: string; mk: string; c: string }
  heading: string
  sub: string
  submit: string
  fields: SceneField[]
}

const SCENES: Scene[] = [
  {
    fav: { t: 'G', c: '#6366f1' },
    url: 'careers.globex.io/apply',
    logo: { t: 'Globex', mk: 'G', c: '#6366f1' },
    heading: 'Apply — Senior Product Designer',
    sub: 'Globex Corporation · Remote · Full-time',
    submit: 'Submit application',
    fields: [
      { label: 'First name', req: true, val: 'Jordan', src: 'saved' },
      { label: 'Last name', req: true, val: 'Avery', src: 'saved' },
      {
        label: 'Email address',
        req: true,
        val: 'jordan.avery@gmail.com',
        src: 'saved',
        wide: true,
      },
      { label: 'Phone', val: '+1 (415) 555-0142', src: 'saved' },
      { label: 'Location', val: 'San Francisco, CA', src: 'ai' },
      {
        label: 'LinkedIn / portfolio',
        val: 'linkedin.com/in/jordanavery',
        src: 'saved',
        wide: true,
      },
    ],
  },
  {
    fav: { t: 'N', c: '#0ea5e9' },
    url: 'checkout.northwind.shop',
    logo: { t: 'Northwind', mk: 'N', c: '#0ea5e9' },
    heading: 'Checkout',
    sub: 'Northwind Shop · Step 2 of 3 — Shipping',
    submit: 'Continue to payment',
    fields: [
      { label: 'Full name', req: true, val: 'Jordan Avery', src: 'saved', wide: true },
      { label: 'Address', req: true, val: '414 Brannan St', src: 'saved', wide: true },
      { label: 'City', req: true, val: 'San Francisco', src: 'saved' },
      { label: 'ZIP', req: true, val: '94107', src: 'saved' },
      { label: 'Country', val: 'United States', src: 'ai' },
      { label: 'Email for receipt', val: 'jordan.avery@gmail.com', src: 'saved' },
    ],
  },
  {
    fav: { t: 'S', c: '#13c296' },
    url: 'crm.summit.dev/leads/new',
    logo: { t: 'Summit CRM', mk: 'S', c: '#13c296' },
    heading: 'New lead',
    sub: 'Summit CRM · Inbound · Q3 pipeline',
    submit: 'Create lead',
    fields: [
      { label: 'Company', req: true, val: 'Helios Robotics', src: 'saved' },
      { label: 'Contact', req: true, val: 'Mei Tanaka', src: 'saved' },
      { label: 'Work email', req: true, val: 'mei@helios.io', src: 'ai', wide: true },
      { label: 'Deal size', val: '$48,000', src: 'ai' },
      { label: 'Source', val: 'Webinar', src: 'ai' },
      { label: 'Notes', val: 'Warm intro via partner team', src: 'ai', wide: true, area: true },
    ],
  },
]

const sceneIdx = ref(0)
const scene = computed(() => SCENES[sceneIdx.value]!)

const filled = ref<boolean[]>([])
const fab = reactive({ show: false, hover: false, press: false, busy: false, done: false })
const fabLabel = computed(() => (fab.busy ? 'Filling…' : fab.done ? 'Filled' : 'Fill'))
const fabLeft = ref(0)
const fabTop = ref(0)
const cursor = reactive({ x: 0, y: 0, visible: false })
const hostSwap = ref(false)
const browserPulse = ref(false)

const rootEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const submitEl = ref<HTMLElement | null>(null)

const reducedMotion = () =>
  import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let generation = 0
let running = false
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Resolve after `ms`, returning false if this run was cancelled meanwhile. */
async function step(ms: number, gen: number) {
  await sleep(ms)
  return running && gen === generation
}

function resetScene() {
  filled.value = scene.value.fields.map(() => false)
  fab.show = fab.hover = fab.press = fab.busy = fab.done = false
  cursor.visible = false
  hostSwap.value = false
  browserPulse.value = false
}

function positionFab() {
  const body = bodyEl.value
  const submit = submitEl.value
  if (!body || !submit) return
  const br = body.getBoundingClientRect()
  const sr = submit.getBoundingClientRect()
  const sLeft = sr.left - br.left
  const sTop = sr.top - br.top
  let left = sLeft + sr.width + 16
  let top = sTop + (sr.height - 44) / 2
  // keep inside the body — if no room to the right, sit just above the submit
  if (left + 150 > body.clientWidth) {
    left = sLeft + sr.width - 44
    top = sTop - 58
  }
  fabLeft.value = left
  fabTop.value = top
}

async function runScene(gen: number) {
  resetScene()
  await nextTick()
  positionFab()

  if (reducedMotion()) {
    filled.value = filled.value.map(() => true)
    fab.show = true
    fab.done = true
    return
  }

  cursor.x = fabLeft.value - 120
  cursor.y = fabTop.value + 140
  cursor.visible = false
  if (!(await step(500, gen))) return
  fab.show = true
  if (!(await step(450, gen))) return
  cursor.visible = true
  cursor.x = fabLeft.value + 12
  cursor.y = fabTop.value + 16
  if (!(await step(820, gen))) return
  fab.hover = true
  if (!(await step(700, gen))) return
  fab.press = true
  if (!(await step(130, gen))) return
  fab.press = false
  fab.hover = false
  fab.busy = true
  cursor.visible = true
  cursor.x = fabLeft.value - 80
  cursor.y = fabTop.value + 90
  if (!(await step(720, gen))) return
  cursor.visible = false
  for (let i = 0; i < filled.value.length; i++) {
    filled.value[i] = true
    if (!(await step(165, gen))) return
  }
  if (!(await step(260, gen))) return
  fab.busy = false
  fab.done = true
  browserPulse.value = true
  setTimeout(() => (browserPulse.value = false), 1000)
  if (!(await step(2300, gen))) return
  hostSwap.value = true
  fab.show = false
  fab.done = false
  if (!(await step(420, gen))) return
}

async function runLoop() {
  const gen = ++generation
  running = true
  if (!(await step(400, gen))) return
  while (running && gen === generation) {
    await runScene(gen)
    if (!running || gen !== generation) return
    if (reducedMotion()) return
    sceneIdx.value = (sceneIdx.value + 1) % SCENES.length
    await nextTick()
  }
}
function stop() {
  running = false
  generation++
}

let io: IntersectionObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(positionFab, 150)
}

onMounted(() => {
  if (!rootEl.value) return
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !running) runLoop()
        else if (!e.isIntersecting && running) stop()
      }
    },
    { threshold: 0.2 },
  )
  io.observe(rootEl.value)
  window.addEventListener('resize', onResize, { passive: true })
})
onBeforeUnmount(() => {
  io?.disconnect()
  stop()
  if (resizeTimer) clearTimeout(resizeTimer)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div id="demo" ref="rootEl" aria-hidden="true">
    <div class="browser" :class="{ 'done-pulse': browserPulse }">
      <div class="browser-bar">
        <div class="bdots"><span></span><span></span><span></span></div>
        <div class="btab">
          <span class="fav" :style="{ background: scene.fav.c }">{{ scene.fav.t }}</span>
          <span class="ttl">{{ scene.heading }}</span>
        </div>
        <div class="burl"><Lock /> {{ scene.url }}</div>
        <div class="bext"><img src="/quikfill-icon.svg" alt="" /></div>
      </div>

      <div ref="bodyEl" class="browser-body">
        <div class="host" :class="{ swap: hostSwap }">
          <div class="host-head">
            <span class="hlogo"
              ><span class="mk" :style="{ background: scene.logo.c }">{{ scene.logo.mk }}</span
              >{{ scene.logo.t }}</span
            >
            <h3>{{ scene.heading }}</h3>
            <p>{{ scene.sub }}</p>
          </div>
          <div class="hform">
            <div
              v-for="(f, i) in scene.fields"
              :key="`${sceneIdx}-${i}`"
              class="hfield"
              :class="{ wide: f.wide, filled: filled[i] }"
            >
              <label>{{ f.label }} <em v-if="f.req">*</em></label>
              <div class="hinput" :class="{ area: f.area }">
                <span class="ph">{{ f.area ? '' : '—' }}</span>
                <span class="val">{{ f.val }}</span>
                <span class="src" :class="f.src">{{ f.src === 'ai' ? 'AI' : 'Saved' }}</span>
              </div>
            </div>
            <div class="hactions">
              <span class="hbtn cancel">Cancel</span>
              <span ref="submitEl" class="hbtn submit">{{ scene.submit }}</span>
            </div>
          </div>
        </div>

        <!-- the floating QuikFill button (anchored next to the form's submit) -->
        <div
          class="qf-fab"
          :class="{
            show: fab.show,
            hover: fab.hover,
            press: fab.press,
            busy: fab.busy,
            done: fab.done,
          }"
          :style="{ left: `${fabLeft}px`, top: `${fabTop}px` }"
        >
          <span class="ficon"><img src="/quikfill-icon.svg" alt="" /></span>
          <span class="fspin"></span>
          <span class="fcheck"><Check /></span>
          <span class="flabel">{{ fabLabel }}</span>
        </div>

        <!-- fake cursor -->
        <div
          class="qf-cursor"
          :class="{ visible: cursor.visible }"
          :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
        >
          <svg viewBox="0 0 24 24" fill="#fff" stroke="#0b0e14" stroke-width="1.2">
            <path d="M5 3l14 7-6 2.2L9.5 19 5 3z" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
