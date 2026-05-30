<script setup lang="ts">
import { Check, Minus, Zap } from 'lucide-vue-next'
import { PLAN_CATALOG, type PlanCatalogEntry } from '@quikfill/schemas'

// Single source of truth: marketing pricing comes from the shared PLAN_CATALOG
// (which mirrors the backend billing doc), so the site can never drift from the
// app/extension. CTAs deep-link into the dashboard; the free tier starts sign-in,
// paid tiers preselect a plan on /billing (self-serve checkout — incl. Enterprise).
const appUrl = useRuntimeConfig().public.appUrl

/** Short token label for the secondary line, e.g. "500K tokens" / "8M+ tokens". */
function tokenLabel(plan: PlanCatalogEntry): string {
  const n = plan.tokenLimit
  const plus = plan.key === 'enterprise' ? '+' : ''
  if (n >= 1_000_000) return `${n / 1_000_000}M${plus} tokens`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K${plus} tokens`
  return `${n.toLocaleString('en-US')} tokens`
}

function ctaLabel(plan: PlanCatalogEntry): string {
  return plan.key === 'free' ? 'Get started' : 'Upgrade'
}

function ctaHref(plan: PlanCatalogEntry): string {
  return plan.key === 'free' ? `${appUrl}/sign-in` : `${appUrl}/billing?plan=${plan.key}`
}
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
        <div
          v-for="plan in PLAN_CATALOG"
          :key="plan.key"
          class="pcard"
          :class="{ feature: plan.recommended }"
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
          <div class="toks">{{ tokenLabel(plan) }}</div>
          <a
            class="btn btn--block pbtn"
            :class="plan.recommended ? 'btn--primary' : 'btn--ghost'"
            :href="ctaHref(plan)"
            style="width: 100%"
          >
            <Zap v-if="plan.recommended" />{{ ctaLabel(plan) }}
          </a>
          <ul>
            <li v-for="f in plan.featureBullets" :key="f.text" :class="{ muted: f.muted }">
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
