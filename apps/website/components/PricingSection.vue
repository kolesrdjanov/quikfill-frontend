<script setup lang="ts">
import { Check, Minus, Zap } from 'lucide-vue-next'
import { PLAN_CATALOG, type PlanCatalogEntry } from '@quikfill/schemas'

// Single source of truth: marketing pricing comes from the shared PLAN_CATALOG
// (which mirrors the backend billing doc), so the site can never drift from the
// app/extension. The design handoff's pricing (token quotas, fabricated feature
// bullets) is intentionally ignored — only its UI is applied. CTAs deep-link into
// the dashboard; the free tier starts sign-in, paid tiers preselect a plan on
// /billing (self-serve checkout — incl. Enterprise).
const appUrl = useRuntimeConfig().public.appUrl

function ctaHref(plan: PlanCatalogEntry): string {
  return plan.key === 'free' ? `${appUrl}/sign-in` : `${appUrl}/billing?plan=${plan.key}`
}
</script>

<template>
  <section id="pricing" class="section">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="sidx">04 / PRICING</span>
        <span class="eyebrow">Pricing</span>
        <h2>Priced by form fills.</h2>
        <p>
          Filling from your own saved data is unlimited and free. You only spend on AI fills —
          measured in forms, billed monthly.
        </p>
      </div>
      <div class="price-grid">
        <div
          v-for="(plan, i) in PLAN_CATALOG"
          :key="plan.key"
          class="pcard reveal"
          :class="{ feature: plan.recommended }"
          :data-d="i + 1"
        >
          <span v-if="plan.recommended" class="tag">Most popular</span>
          <span class="tier">{{ plan.displayName }}</span>
          <div class="price">
            <span class="amt">{{ plan.priceLabel }}</span
            ><span class="per">{{ plan.pricePer }}</span>
          </div>
          <div class="fills">
            <b>{{ plan.marketingFills }}</b> AI form fills / mo
          </div>
          <div class="tagline">{{ plan.tagline }}</div>
          <a
            class="btn btn--block pbtn"
            :class="plan.recommended ? 'btn--primary' : 'btn--ghost'"
            :href="ctaHref(plan)"
          >
            <Zap v-if="plan.recommended" />Get started
          </a>
          <ul>
            <li v-for="f in plan.featureBullets" :key="f.text" :class="{ muted: f.muted }">
              <Minus v-if="f.muted" /><Check v-else /> {{ f.text }}
            </li>
          </ul>
        </div>
      </div>
      <p class="price-note">
        A “form fill” = one AI-filled form, any size. Hit your limit and QuikFill keeps filling from
        saved data — only AI pauses until next cycle.
      </p>
    </div>
  </section>
</template>
