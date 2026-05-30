<script setup lang="ts">
import type { Component } from 'vue'
import { Check, Minus, Zap } from 'lucide-vue-next'

interface Feature {
  text: string
  muted?: boolean
}
interface Tier {
  name: string
  feature?: boolean
  tag?: string
  price: string
  per: string
  fills: string
  toks: string
  ctaLabel: string
  ctaPrimary?: boolean
  ctaIcon?: Component
  features: Feature[]
}

// Single source of truth for plan limits (WEBSITE_PLAN: don't scatter across components).
const tiers: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    per: '/ forever',
    fills: '~10',
    toks: '2,500 tokens',
    ctaLabel: 'Get started',
    features: [
      { text: 'Unlimited manual scan & fill' },
      { text: 'Saved profiles & records' },
      { text: 'Generators & undo' },
      { text: 'Limited AI classification', muted: true },
    ],
  },
  {
    name: 'Starter',
    price: '$12',
    per: '/ mo',
    fills: '~2,000',
    toks: '500K tokens',
    ctaLabel: 'Start free trial',
    features: [
      { text: 'Everything in Free' },
      { text: '500K AI tokens / month' },
      { text: 'Priority field classification' },
      { text: 'Email support' },
    ],
  },
  {
    name: 'Pro Tester',
    feature: true,
    tag: 'Most popular',
    price: '$29',
    per: '/ mo',
    fills: '~8,000',
    toks: '2M tokens',
    ctaLabel: 'Start free trial',
    ctaPrimary: true,
    ctaIcon: Zap,
    features: [
      { text: 'Everything in Starter' },
      { text: '2M AI tokens / month' },
      { text: 'Seedable generators for QA' },
      { text: 'Profile sync across devices' },
    ],
  },
  {
    name: 'Enterprise',
    price: '$99',
    per: '+ / mo',
    fills: '32,000+',
    toks: '8M+ tokens',
    ctaLabel: 'Contact sales',
    features: [
      { text: 'Everything in Pro Tester' },
      { text: '8M+ AI tokens / month' },
      { text: 'SSO & team management' },
      { text: 'Dedicated support & SLA' },
    ],
  },
]
</script>

<template>
  <section id="pricing" class="section">
    <div class="wrap">
      <div class="section-head center">
        <span class="eyebrow">Pricing</span>
        <h2>Priced by form fills.</h2>
        <p>
          Scanning and filling from your own data is unlimited and free. You only spend on AI
          classification — measured in form fills, billed monthly.
        </p>
      </div>
      <div class="price-grid">
        <div v-for="t in tiers" :key="t.name" class="pcard" :class="{ feature: t.feature }">
          <span v-if="t.tag" class="tag">{{ t.tag }}</span>
          <span class="tier">{{ t.name }}</span>
          <div class="price">
            <span class="amt">{{ t.price }}</span
            ><span class="per">{{ t.per }}</span>
          </div>
          <div class="fills">
            <b>{{ t.fills }}</b> AI form fills / mo
          </div>
          <div class="toks">{{ t.toks }}</div>
          <a
            class="btn btn--block pbtn"
            :class="t.ctaPrimary ? 'btn--primary' : 'btn--ghost'"
            href="#"
            style="width: 100%"
          >
            <component :is="t.ctaIcon" v-if="t.ctaIcon" />{{ t.ctaLabel }}
          </a>
          <ul>
            <li v-for="f in t.features" :key="f.text" :class="{ muted: f.muted }">
              <Minus v-if="f.muted" /><Check v-else /> {{ f.text }}
            </li>
          </ul>
        </div>
      </div>
      <p class="price-note">
        A “form fill” ≈ one AI-classified form of average size. Hit your limit and QuikFill keeps
        filling from saved data — only AI pauses until next cycle.
      </p>
    </div>
  </section>
</template>
