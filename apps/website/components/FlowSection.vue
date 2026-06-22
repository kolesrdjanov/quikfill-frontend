<script setup lang="ts">
import { ScanSearch, MousePointerClick, Zap, CheckCheck } from 'lucide-vue-next'

const steps = [
  {
    icon: ScanSearch,
    n: '01',
    title: 'Detect',
    body: "On every page, QuikFill finds each form and anchors its own button next to that form's submit — automatically, even on modals and SPA routes.",
  },
  {
    icon: MousePointerClick,
    n: '02',
    title: 'Hover',
    body: 'One button, one affordance. Hover and it reveals a single Fill action. No menus, no field-by-field setup.',
  },
  {
    icon: Zap,
    n: '03',
    title: 'Fill',
    body: "Click once. AI reads each field's context and fills every native input in a second — from your saved data and smart generators.",
  },
  {
    icon: CheckCheck,
    n: '04',
    title: 'Verify',
    body: 'Every value is written with real input events and verified on the page, so what you see is exactly what the form received.',
  },
]
</script>

<template>
  <section id="flow" class="section flow">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="sidx">01 / THE FLOW</span>
        <span class="eyebrow">How it works</span>
        <h2>No panel. No setup.<br />Just a button where you need it.</h2>
        <p>
          The old scan-and-preview wizard is gone. QuikFill now lives on the page itself — one
          button per form, right where you'd hit submit.
        </p>
      </div>
      <div class="flow-grid">
        <div v-for="(s, i) in steps" :key="s.title" class="flow-card reveal" :data-d="i + 1">
          <span class="ic"><component :is="s.icon" /></span>
          <span class="n">{{ s.n }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.body }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
