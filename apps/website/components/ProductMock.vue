<script setup lang="ts">
import type { Component } from 'vue'
import {
  ScanLine,
  ShieldCheck,
  User,
  Mail,
  Phone,
  Link,
  Sparkles,
  Circle,
  Check,
  Eye,
  WandSparkles,
  CheckCheck,
  RotateCcw,
  Lock,
} from 'lucide-vue-next'

type FieldKey = 'first' | 'last' | 'email' | 'phone' | 'portfolio' | 'location' | 'exp'
type Source = 'saved' | 'ai' | 'gen'

/* ---- host form (the page being filled) ---- */
interface HostField {
  key: FieldKey
  label: string
  required?: boolean
  wide?: boolean
  ph: string
  typed: string
}
const aboutYou: HostField[] = [
  { key: 'first', label: 'First name', required: true, ph: 'Your first name', typed: 'Jordan' },
  { key: 'last', label: 'Last name', required: true, ph: 'Your last name', typed: 'Avery' },
  {
    key: 'email',
    label: 'Email address',
    required: true,
    ph: 'you@email.com',
    typed: 'jordan.avery@gmail.com',
  },
  { key: 'phone', label: 'Phone', ph: '+1', typed: '+1 (415) 555-0142' },
  {
    key: 'portfolio',
    label: 'LinkedIn / portfolio',
    wide: true,
    ph: 'https://',
    typed: 'linkedin.com/in/jordanavery',
  },
]
const roleDetails: HostField[] = [
  {
    key: 'location',
    label: 'Location',
    required: true,
    ph: 'City, State',
    typed: 'San Francisco, CA',
  },
  { key: 'exp', label: 'Years of experience', ph: 'Select…', typed: '6 years' },
]

/* ---- QuikFill panel rows (the fill plan) ---- */
interface Row {
  key: FieldKey
  icon: Component
  name: string
  src: Source
  srcLabel: string
  meter: number
  value: string
}
const rows: Row[] = [
  {
    key: 'first',
    icon: User,
    name: 'First name',
    src: 'saved',
    srcLabel: 'Saved',
    meter: 98,
    value: 'Jordan',
  },
  {
    key: 'last',
    icon: User,
    name: 'Last name',
    src: 'saved',
    srcLabel: 'Saved',
    meter: 98,
    value: 'Avery',
  },
  {
    key: 'email',
    icon: Mail,
    name: 'Email address',
    src: 'saved',
    srcLabel: 'Saved',
    meter: 99,
    value: 'jordan.avery@gmail.com',
  },
  {
    key: 'phone',
    icon: Phone,
    name: 'Phone',
    src: 'gen',
    srcLabel: 'Generated',
    meter: 100,
    value: '+1 (415) 555-0142',
  },
  {
    key: 'portfolio',
    icon: Link,
    name: 'LinkedIn / portfolio',
    src: 'saved',
    srcLabel: 'Saved',
    meter: 95,
    value: 'linkedin.com/in/jordanavery',
  },
  {
    key: 'location',
    icon: Sparkles,
    name: 'Location',
    src: 'ai',
    srcLabel: 'AI · classified',
    meter: 91,
    value: 'San Francisco, CA',
  },
  {
    key: 'exp',
    icon: Sparkles,
    name: 'Years of experience',
    src: 'ai',
    srcLabel: 'AI · classified',
    meter: 87,
    value: '6 years',
  },
]
const FIELDS = rows.map((r) => r.key)
const N = rows.length

/* ---- reactive animation state ---- */
type MfState = '' | 'scan' | 'preview' | 'fill'
type RowState = { show: boolean; preview: boolean; done: boolean }

const view = ref<'scan' | 'work'>('scan')
const statusScan = ref(true)
const statusText = ref('Scanning page…')
const statusCount = ref('0 fields')
const btnText = ref('Scan page')
const btnIcon = shallowRef<Component>(ScanLine)
const btnCls = ref('')
const btn2Visible = ref(false)
const pressed = ref(false)

const mf = reactive<Record<FieldKey, MfState>>(
  Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<FieldKey, MfState>,
)
const rowState = reactive<Record<FieldKey, RowState>>(
  Object.fromEntries(
    FIELDS.map((f) => [f, { show: false, preview: false, done: false }]),
  ) as Record<FieldKey, RowState>,
)

const reduced = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---- timer plumbing (mirrors anim.js) ---- */
let timers: ReturnType<typeof setTimeout>[] = []
const after = (ms: number, fn: () => void) => {
  const t = setTimeout(fn, ms)
  timers.push(t)
  return t
}
const clearAll = () => {
  timers.forEach(clearTimeout)
  timers = []
}

function setBtn(text: string, icon: Component, cls: string) {
  btnText.value = text
  btnIcon.value = icon
  btnCls.value = cls
}
function pressPulse() {
  pressed.value = true
  after(140, () => (pressed.value = false))
}
function reset() {
  FIELDS.forEach((f) => {
    rowState[f].show = false
    rowState[f].preview = false
    rowState[f].done = false
    mf[f] = ''
  })
  btn2Visible.value = false
  statusScan.value = true
  view.value = 'scan'
  setBtn('Scan page', ScanLine, '')
}

function showFinal() {
  view.value = 'work'
  statusScan.value = false
  statusText.value = 'Filled · verified'
  statusCount.value = `${N}/${N}`
  FIELDS.forEach((f) => {
    rowState[f].show = true
    rowState[f].done = true
    mf[f] = 'fill'
  })
  setBtn(`Filled · ${N}/${N}`, CheckCheck, 'done')
  btn2Visible.value = true
}

function run() {
  clearAll()
  reset()
  if (reduced) {
    after(300, showFinal)
    return
  }

  // 0) dwell on scan CTA
  after(1700, () => {
    pressPulse()
    // 1) scanning — reveal rows + sweep form fields, count up
    after(260, () => {
      view.value = 'work'
      statusScan.value = true
      statusText.value = 'Scanning page…'
      let detected = 0
      rows.forEach((r, i) => {
        after(i * 230, () => {
          rowState[r.key].show = true
          mf[r.key] = 'scan'
          after(620, () => {
            if (mf[r.key] === 'scan') mf[r.key] = ''
          })
          detected++
          statusCount.value = detected + (detected === 1 ? ' field' : ' fields')
        })
      })
      // 2) detected
      after(N * 230 + 520, () => {
        statusScan.value = false
        statusText.value = `${N} fields detected`
        setBtn(`Preview fill (${N})`, Eye, '')
        // 3) preview
        after(1100, () => {
          pressPulse()
          after(260, () => {
            statusText.value = 'Preview ready · review'
            rows.forEach((r, i) =>
              after(i * 70, () => {
                rowState[r.key].preview = true
                mf[r.key] = 'preview'
              }),
            )
            setBtn(`Fill ${N} fields`, WandSparkles, '')
            // 4) fill
            after(1350, () => {
              pressPulse()
              after(220, () => {
                statusScan.value = false
                let filled = 0
                rows.forEach((r, i) =>
                  after(i * 300, () => {
                    mf[r.key] = 'fill'
                    rowState[r.key].preview = false
                    rowState[r.key].done = true
                    filled++
                    statusText.value = filled < N ? 'Filling…' : 'Filled · verified'
                    statusCount.value = `${filled}/${N}`
                  }),
                )
                // 5) done
                after(N * 300 + 360, () => {
                  setBtn(`Filled · ${N}/${N}`, CheckCheck, 'done')
                  btn2Visible.value = true
                  after(3000, run) // loop
                })
              })
            })
          })
        })
      })
    })
  })
}

/* ---- run only while visible; restart when re-entering view ---- */
const mockEl = ref<HTMLElement | null>(null)
let running = false
let io: IntersectionObserver | null = null

onMounted(() => {
  if (!mockEl.value) return
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !running) {
          running = true
          run()
        } else if (!e.isIntersecting && running) {
          running = false
          clearAll()
        }
      })
    },
    { threshold: 0.25 },
  )
  io.observe(mockEl.value)
})
onBeforeUnmount(() => {
  io?.disconnect()
  clearAll()
})

// let a curious user replay by clicking the panel button
function onBtnClick() {
  if (running) run()
}
</script>

<template>
  <div id="mockHome" class="mock-stage">
    <div id="mock" ref="mockEl" class="mock" data-step="idle">
      <div class="mb-bar">
        <div class="mb-dots"><span></span><span></span><span></span></div>
        <div class="mb-tab">
          <span class="fav" style="background: #6366f1">G</span
          ><span>Apply — Senior Product Designer</span>
        </div>
        <div class="mb-url"><Lock /> careers.globex.io/apply</div>
        <div class="mb-ext"><img src="/quikfill-icon.svg" alt="" /><span class="live"></span></div>
      </div>
      <div class="mb-body">
        <!-- host form -->
        <div class="mb-host">
          <div class="fm-head">
            <h4>Apply — Senior Product Designer</h4>
            <p>Globex Corporation · Remote · Full-time</p>
          </div>
          <div class="fm-sec">About you</div>
          <div class="fm-grid">
            <div
              v-for="f in aboutYou"
              :key="f.key"
              class="mf"
              :class="[{ wide: f.wide }, mf[f.key] ? `is-${mf[f.key]}` : '']"
              :data-f="f.key"
            >
              <label>{{ f.label }} <em v-if="f.required">*</em></label>
              <div class="mf-val">
                <span class="ph">{{ f.ph }}</span
                ><span class="typed">{{ f.typed }}</span>
              </div>
            </div>
          </div>
          <div class="fm-sec">Role details</div>
          <div class="fm-grid">
            <div
              v-for="f in roleDetails"
              :key="f.key"
              class="mf"
              :class="[{ wide: f.wide }, mf[f.key] ? `is-${mf[f.key]}` : '']"
              :data-f="f.key"
            >
              <label>{{ f.label }} <em v-if="f.required">*</em></label>
              <div class="mf-val">
                <span class="ph">{{ f.ph }}</span
                ><span class="typed">{{ f.typed }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- QuikFill popup (anchored to the toolbar) -->
        <aside class="mb-panel">
          <div class="pp-head">
            <img src="/quikfill-icon.svg" alt="" />
            <span class="nm">Quik<em>Fill</em></span>
            <span class="host"><span class="fav">G</span>globex.io</span>
          </div>
          <div class="pp-body">
            <!-- scan view -->
            <div class="pv pv-scan" :class="{ on: view === 'scan' }" data-view="scan">
              <span class="scan-ico"><ScanLine /></span>
              <h5>Scan this page</h5>
              <p>Detect every field, then preview a fill plan before anything is written.</p>
              <span class="reassure"><ShieldCheck /> Nothing is read until you scan</span>
            </div>
            <!-- work view -->
            <div class="pv pv-work" :class="{ on: view === 'work' }" data-view="work">
              <div id="pwStatus" class="pw-status" :class="{ scan: statusScan }">
                <span class="sp"></span><span class="txt">{{ statusText }}</span
                ><span class="cnt">{{ statusCount }}</span>
              </div>
              <div class="pw-list">
                <div
                  v-for="r in rows"
                  :key="r.key"
                  class="prow"
                  :class="[
                    `src-${r.src}`,
                    {
                      show: rowState[r.key].show,
                      preview: rowState[r.key].preview,
                      done: rowState[r.key].done,
                    },
                  ]"
                  :data-f="r.key"
                >
                  <span class="ricon"><component :is="r.icon" /></span>
                  <div class="rmid">
                    <div class="rname">{{ r.name }}</div>
                    <div class="rmeta">
                      <span class="rsrc">{{ r.srcLabel }}</span
                      ><span class="rmeter"><i :style="{ width: `${r.meter}%` }"></i></span>
                    </div>
                    <div class="rval">{{ r.value }}</div>
                  </div>
                  <span class="rstat"
                    ><component :is="rowState[r.key].done ? Check : Circle"
                  /></span>
                </div>
              </div>
              <div class="pw-foot">
                <button
                  id="ppBtn"
                  class="pp-btn"
                  :class="btnCls"
                  :style="{ transform: pressed ? 'scale(.97)' : '' }"
                  @click="onBtnClick"
                >
                  <component :is="btnIcon" /> <span>{{ btnText }}</span>
                </button>
                <button v-show="btn2Visible" id="ppBtn2" class="pp-btn ghost">
                  <RotateCcw /> Undo fill
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
