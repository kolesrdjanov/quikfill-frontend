<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, AlertTriangle, Coins, TrendingUp, Users } from 'lucide-vue-next'
import type { AnalyticsPeriod, AnalyticsUserRow } from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Card,
  CardContent,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@quikfill/ui'
import { useAnalyticsStore } from '@/stores/analytics'
import { useApiError } from '@/composables/useApiError'
import { formatCompactNumber, formatPercent, formatUsdCents } from '@/lib/format'

const store = useAnalyticsStore()
const { handleError } = useApiError()

type SortKey = 'tokens' | 'requests' | 'estCostUsdCents' | 'utilizationPercent' | 'marginUsdCents'
const sortKey = ref<SortKey>('tokens')

function setPeriod(period: AnalyticsPeriod): void {
  void store.load(period).catch(handleError)
}

onMounted(() => setPeriod('current_month'))

const isMonth = computed(() => store.period === 'current_month')
const overview = computed(() => store.data?.overview ?? null)
const pricing = computed(() => store.data?.pricing ?? null)
const byEndpoint = computed(() => store.data?.byEndpoint ?? [])
const totalTokens = computed(() => store.data?.overview.totalTokens ?? 0)

const sortedUsers = computed<AnalyticsUserRow[]>(() => {
  const users = store.data?.users ?? []
  const key = sortKey.value
  return [...users].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity))
})

function endpointShare(tokens: number): number {
  return totalTokens.value > 0 ? (tokens / totalTokens.value) * 100 : 0
}

function utilizationTint(row: AnalyticsUserRow): string {
  const pct = row.utilizationPercent ?? 0
  if (pct >= 90) return 'bg-destructive'
  if (pct >= 60) return 'bg-warning'
  return 'bg-primary'
}

function marginVariant(row: AnalyticsUserRow): 'success' | 'danger' | 'gray' {
  if (row.marginUsdCents === undefined) return 'gray'
  return row.marginUsdCents >= 0 ? 'success' : 'danger'
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start justify-between gap-4">
      <p class="text-muted-foreground text-sm">
        Usage, tokens and estimated cost across all users.
        <template v-if="pricing">
          Cost is an estimate ({{ store.data?.model }} @ ${{ pricing.inputUsdPerMTok }}/${{
            pricing.outputUsdPerMTok
          }}
          per 1M in/out tokens — override in env).
        </template>
      </p>
      <Tabs
        :model-value="store.period"
        @update:model-value="(v) => setPeriod(v as AnalyticsPeriod)"
      >
        <TabsList>
          <TabsTrigger value="current_month">This month</TabsTrigger>
          <TabsTrigger value="all_time">All time</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div v-if="store.loading" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton v-for="n in 4" :key="n" class="h-24 w-full" />
      </div>
      <Skeleton class="h-64 w-full" />
    </div>

    <Alert v-else-if="store.error" variant="danger">
      <AlertTriangle />
      <div>
        <p class="font-semibold">Couldn't load analytics</p>
        <p>{{ store.error }}</p>
      </div>
    </Alert>

    <template v-else-if="overview">
      <!-- Overview stat cards -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent class="space-y-1">
            <div class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Activity class="size-3.5" /> Requests
            </div>
            <div class="text-2xl font-bold">{{ formatCompactNumber(overview.totalRequests) }}</div>
            <div class="text-muted-foreground text-xs">
              {{ overview.activeUsers }}/{{ overview.totalUsers }} users active
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-1">
            <div class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Coins class="size-3.5" /> Tokens
            </div>
            <div class="text-2xl font-bold">{{ formatCompactNumber(overview.totalTokens) }}</div>
            <div class="text-muted-foreground text-xs">
              {{ formatCompactNumber(overview.totalTokensIn) }} in ·
              {{ formatCompactNumber(overview.totalTokensOut) }} out
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-1">
            <div class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Coins class="size-3.5" /> Est. cost
            </div>
            <div class="text-2xl font-bold">{{ formatUsdCents(overview.estCostUsdCents) }}</div>
            <div class="text-muted-foreground text-xs">
              MRR {{ formatUsdCents(overview.monthlyRevenueUsdCents) }}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-1">
            <div class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <TrendingUp class="size-3.5" /> Net margin
            </div>
            <div class="text-2xl font-bold">
              {{ isMonth ? formatUsdCents(overview.netMarginUsdCents) : '—' }}
            </div>
            <div class="text-muted-foreground text-xs">revenue − est. cost</div>
          </CardContent>
        </Card>
      </div>

      <!-- By-endpoint breakdown -->
      <Card v-if="byEndpoint.length > 0">
        <CardContent class="space-y-3">
          <div class="text-sm font-semibold">By endpoint</div>
          <div v-for="row in byEndpoint" :key="row.endpoint" class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium">{{ row.endpoint }}</span>
              <span class="text-muted-foreground">
                {{ formatCompactNumber(row.requests) }} req · {{ formatCompactNumber(row.tokens) }}
                tok
              </span>
            </div>
            <Progress :model-value="endpointShare(row.tokens)" />
          </div>
        </CardContent>
      </Card>

      <!-- Per-user table -->
      <Alert v-if="sortedUsers.length === 0" variant="info">
        <Users />
        <div>
          <p class="font-semibold">No users yet</p>
          <p>Usage will appear here once people start filling forms with AI.</p>
        </div>
      </Alert>

      <TableContainer v-else>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead class="cursor-pointer" @click="sortKey = 'requests'">Requests</TableHead>
              <TableHead class="cursor-pointer" @click="sortKey = 'tokens'">Tokens</TableHead>
              <TableHead class="w-40">Utilization</TableHead>
              <TableHead class="cursor-pointer" @click="sortKey = 'estCostUsdCents'"
                >Est. cost</TableHead
              >
              <TableHead class="cursor-pointer" @click="sortKey = 'marginUsdCents'"
                >Margin</TableHead
              >
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="row in sortedUsers" :key="row.userId">
              <TableCell class="font-medium">{{ row.email }}</TableCell>
              <TableCell
                ><Badge variant="gray">{{ row.planDisplayName }}</Badge></TableCell
              >
              <TableCell>{{ formatCompactNumber(row.requests) }}</TableCell>
              <TableCell>
                {{ formatCompactNumber(row.tokens) }}
                <span class="text-muted-foreground text-xs">
                  / {{ row.planTokenLimit === 0 ? '∞' : formatCompactNumber(row.planTokenLimit) }}
                </span>
              </TableCell>
              <TableCell>
                <div v-if="isMonth && row.utilizationPercent !== undefined" class="space-y-1">
                  <Progress
                    :model-value="row.utilizationPercent"
                    :indicator-class="utilizationTint(row)"
                  />
                  <div class="text-muted-foreground text-xs">
                    {{ formatPercent(row.utilizationPercent) }}
                  </div>
                </div>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
              <TableCell>{{ formatUsdCents(row.estCostUsdCents) }}</TableCell>
              <TableCell>
                <Badge
                  v-if="isMonth && row.marginUsdCents !== undefined"
                  :variant="marginVariant(row)"
                >
                  {{ formatUsdCents(row.marginUsdCents) }}
                </Badge>
                <span v-else class="text-muted-foreground text-xs">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </template>
  </div>
</template>
