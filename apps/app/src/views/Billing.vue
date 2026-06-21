<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
} from '@quikfill/ui'
import { Check, CreditCard } from 'lucide-vue-next'
import {
  PLAN_CATALOG,
  formatFillUsage,
  isOverQuota,
  isNearQuota,
  isUnlimited,
  planByKey,
  usagePercent,
} from '@quikfill/schemas'
import type { PaidPlanKey, PlanCatalogEntry, SubscriptionStatus } from '@quikfill/schemas'
import { useSubscriptionStore } from '@/stores/subscription'
import { useApiError } from '@/composables/useApiError'

const route = useRoute()
const subscription = useSubscriptionStore()
const { handleError } = useApiError()

const STATUS_BADGE: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'outline' }
> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'secondary' },
  past_due: { label: 'Past due', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'outline' },
  incomplete: { label: 'Incomplete', variant: 'warning' },
}

const ent = computed(() => subscription.entitlements)
const currentPlan = computed(() => (ent.value ? planByKey(ent.value.planKey) : null))

/** A user with billing history (anything past Free) can open the Stripe Portal. */
const hasBillingAccount = computed(() => !!ent.value && ent.value.planKey !== 'free')
/** Actively paying — plan changes route through the Portal to avoid double-billing. */
const isSubscribed = computed(
  () => !!ent.value && ent.value.planKey !== 'free' && ent.value.status !== 'canceled',
)

const unlimited = computed(() => !!ent.value && isUnlimited(ent.value.fillLimit))
const percent = computed(() =>
  ent.value ? usagePercent(ent.value.fillsUsed, ent.value.fillLimit) : 0,
)
const overQuota = computed(
  () => !!ent.value && isOverQuota(ent.value.fillsUsed, ent.value.fillLimit),
)
const nearQuota = computed(
  () => !!ent.value && isNearQuota(ent.value.fillsUsed, ent.value.fillLimit),
)
const indicatorClass = computed(() =>
  overQuota.value ? 'bg-destructive' : nearQuota.value ? 'bg-amber-500' : undefined,
)
const resetDate = computed(() =>
  ent.value?.currentPeriodEnd ? new Date(ent.value.currentPeriodEnd).toLocaleDateString() : null,
)

const highlightedPlan = computed(() =>
  typeof route.query.plan === 'string' ? route.query.plan : null,
)

function isCurrent(plan: PlanCatalogEntry): boolean {
  return ent.value?.planKey === plan.key
}

/** Whether to render a CTA button on a plan card (current plan never shows one). */
function showCta(plan: PlanCatalogEntry): boolean {
  if (isCurrent(plan)) return false
  return isSubscribed.value || plan.selfServe
}

function ctaLabel(plan: PlanCatalogEntry): string {
  if (isSubscribed.value) return plan.priceUsdCents === 0 ? 'Downgrade' : 'Switch plan'
  return 'Upgrade'
}

async function choosePlan(plan: PlanCatalogEntry): Promise<void> {
  try {
    if (isSubscribed.value) {
      // Existing subscribers change plans in the Portal (handles proration).
      await subscription.openPortal()
    } else if (plan.selfServe) {
      await subscription.startCheckout(plan.key as PaidPlanKey)
    }
  } catch (error) {
    handleError(error)
  }
}

async function manageBilling(): Promise<void> {
  try {
    await subscription.openPortal()
  } catch (error) {
    handleError(error)
  }
}

onMounted(async () => {
  try {
    await subscription.fetch()
  } catch (error) {
    handleError(error)
  }
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Billing</h1>
      <p class="text-muted-foreground mt-1 text-sm">Manage your plan, usage and payment details.</p>
    </div>

    <!-- Loading -->
    <div v-if="subscription.loading && !ent" class="space-y-4">
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-28 w-full" />
    </div>

    <template v-else-if="ent">
      <!-- Past-due / canceled banners -->
      <Alert
        v-if="ent.status === 'past_due'"
        class="border-amber-500/50 text-amber-700 dark:text-amber-400"
      >
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Update your card to avoid losing AI access.</span>
          <Button size="sm" variant="outline" @click="manageBilling">Update payment</Button>
        </AlertDescription>
      </Alert>

      <Alert v-else-if="ent.status === 'canceled'">
        <AlertTitle>Subscription canceled</AlertTitle>
        <AlertDescription>
          You're back on the Free tier. Re-subscribe below to restore your AI allowance.
        </AlertDescription>
      </Alert>

      <!-- Current plan -->
      <Card>
        <CardHeader class="flex flex-row items-start justify-between gap-4">
          <div class="space-y-1">
            <CardTitle class="flex items-center gap-2">
              {{ currentPlan?.displayName ?? ent.displayName }}
              <Badge :variant="STATUS_BADGE[ent.status].variant">
                {{ STATUS_BADGE[ent.status].label }}
              </Badge>
            </CardTitle>
            <p class="text-muted-foreground text-sm">
              <span class="text-foreground font-medium">{{ currentPlan?.priceLabel }}</span>
              {{ currentPlan?.pricePer }}
              <template v-if="resetDate"> · Renews {{ resetDate }}</template>
            </p>
          </div>
          <Button v-if="hasBillingAccount" variant="outline" @click="manageBilling">
            <CreditCard class="mr-2 size-4" />
            Manage payment &amp; invoices
          </Button>
        </CardHeader>
      </Card>

      <!-- Usage -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">AI usage this cycle</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <template v-if="unlimited">
            <p class="text-foreground text-sm font-medium">Unlimited AI</p>
            <p class="text-muted-foreground text-sm">
              {{ formatFillUsage(ent.fillsUsed, ent.fillLimit) }} used this cycle.
            </p>
          </template>
          <template v-else>
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium"
                >{{ formatFillUsage(ent.fillsUsed, ent.fillLimit) }} form fills used</span
              >
              <span class="text-muted-foreground">{{ percent }}%</span>
            </div>
            <Progress :model-value="percent" :indicator-class="indicatorClass" />
            <p v-if="resetDate" class="text-muted-foreground text-xs">Resets {{ resetDate }}</p>
            <p v-if="overQuota" class="text-destructive text-xs font-medium">
              Monthly AI limit reached. Manual fill from saved data still works — upgrade to keep
              using AI.
            </p>
          </template>
        </CardContent>
      </Card>

      <!-- Plans -->
      <div>
        <h2 class="mb-3 text-lg font-semibold tracking-tight">Plans</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            v-for="plan in PLAN_CATALOG"
            :key="plan.key"
            :class="[
              'flex flex-col',
              plan.recommended ? 'border-primary' : '',
              highlightedPlan === plan.key ? 'ring-primary ring-2' : '',
            ]"
          >
            <CardHeader>
              <div class="flex flex-col gap-2">
                <div class="flex min-h-6 items-start justify-between gap-2">
                  <CardTitle class="text-base leading-tight">{{ plan.displayName }}</CardTitle>
                  <Badge v-if="isCurrent(plan)" variant="success" class="shrink-0">Current</Badge>
                  <Badge v-else-if="plan.recommended" variant="secondary" class="shrink-0">
                    Most popular
                  </Badge>
                </div>
                <div class="flex items-baseline gap-1">
                  <span class="text-foreground text-2xl font-semibold">{{ plan.priceLabel }}</span>
                  <span class="text-muted-foreground text-sm">{{ plan.pricePer }}</span>
                </div>
                <p class="text-muted-foreground text-xs">
                  {{ plan.marketingFills }} form fills / mo
                </p>
              </div>
            </CardHeader>
            <CardContent class="flex flex-1 flex-col gap-4">
              <ul class="flex-1 space-y-2 text-sm">
                <li
                  v-for="bullet in plan.featureBullets"
                  :key="bullet.text"
                  :class="['flex items-start gap-2', bullet.muted ? 'text-muted-foreground' : '']"
                >
                  <Check class="text-primary mt-0.5 size-4 shrink-0" />
                  <span>{{ bullet.text }}</span>
                </li>
              </ul>
              <Button
                v-if="showCta(plan)"
                :variant="plan.recommended ? 'default' : 'outline'"
                class="w-full"
                @click="choosePlan(plan)"
              >
                {{ ctaLabel(plan) }}
              </Button>
              <p v-else-if="isCurrent(plan)" class="text-muted-foreground text-center text-xs">
                Your current plan
              </p>
            </CardContent>
          </Card>
        </div>
        <p class="text-muted-foreground mt-3 text-xs">
          Filling from your saved data and generators is always unlimited and free — only AI field
          classification draws from your monthly allowance.
        </p>
      </div>
    </template>
  </div>
</template>
