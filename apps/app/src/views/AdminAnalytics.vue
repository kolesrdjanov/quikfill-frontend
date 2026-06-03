<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Coins,
  TrendingUp,
  Users,
} from 'lucide-vue-next'
import type { AnalyticsPeriod, AnalyticsSort } from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationLast,
  PaginationList,
  PaginationListItem,
  PaginationNext,
  PaginationPrev,
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

onMounted(() => void store.load().catch(handleError))

const isMonth = computed(() => store.period === 'current_month')
const overview = computed(() => store.data?.overview ?? null)
const pricing = computed(() => store.data?.pricing ?? null)
const byEndpoint = computed(() => store.data?.byEndpoint ?? [])
const pagination = computed(() => store.data?.pagination ?? null)
const users = computed(() => store.data?.users ?? [])
const totalTokens = computed(() => store.data?.overview.totalTokens ?? 0)

function changePeriod(period: AnalyticsPeriod): void {
  void store.setPeriod(period).catch(handleError)
}
function changeSort(key: AnalyticsSort): void {
  void store.setSort(key).catch(handleError)
}
function changePage(uiPage: number): void {
  void store.setPage(uiPage - 1).catch(handleError)
}

function endpointShare(tokens: number): number {
  return totalTokens.value > 0 ? (tokens / totalTokens.value) * 100 : 0
}
function utilizationTint(pct: number | undefined): string {
  const value = pct ?? 0
  if (value >= 90) return 'bg-destructive'
  if (value >= 60) return 'bg-warning'
  return 'bg-primary'
}
function marginVariant(margin: number): 'success' | 'danger' {
  return margin >= 0 ? 'success' : 'danger'
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
        @update:model-value="(v) => changePeriod(v as AnalyticsPeriod)"
      >
        <TabsList>
          <TabsTrigger value="current_month">This month</TabsTrigger>
          <TabsTrigger value="all_time">All time</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div v-if="store.loading && !store.data" class="space-y-4">
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

    <div
      v-else-if="overview"
      class="space-y-5"
      :class="store.loading ? 'pointer-events-none opacity-60 transition-opacity' : ''"
    >
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
            <div class="text-2xl font-bold">{{ formatUsdCents(overview.netMarginUsdCents) }}</div>
            <div class="text-muted-foreground text-xs">
              {{ isMonth ? 'revenue − est. cost' : 'MRR − lifetime cost' }}
            </div>
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
      <Alert v-if="users.length === 0" variant="info">
        <Users />
        <div>
          <p class="font-semibold">No users yet</p>
          <p>Usage will appear here once people start filling forms with AI.</p>
        </div>
      </Alert>

      <template v-else>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead class="cursor-pointer select-none" @click="changeSort('requests')">
                  <span class="inline-flex items-center gap-1">
                    Requests
                    <component
                      :is="store.order === 'desc' ? ChevronDown : ChevronUp"
                      v-if="store.sort === 'requests'"
                      class="size-3"
                    />
                  </span>
                </TableHead>
                <TableHead class="cursor-pointer select-none" @click="changeSort('tokens')">
                  <span class="inline-flex items-center gap-1">
                    Tokens
                    <component
                      :is="store.order === 'desc' ? ChevronDown : ChevronUp"
                      v-if="store.sort === 'tokens'"
                      class="size-3"
                    />
                  </span>
                </TableHead>
                <TableHead class="w-40">Utilization</TableHead>
                <TableHead
                  class="cursor-pointer select-none"
                  @click="changeSort('estCostUsdCents')"
                >
                  <span class="inline-flex items-center gap-1">
                    Est. cost
                    <component
                      :is="store.order === 'desc' ? ChevronDown : ChevronUp"
                      v-if="store.sort === 'estCostUsdCents'"
                      class="size-3"
                    />
                  </span>
                </TableHead>
                <TableHead class="cursor-pointer select-none" @click="changeSort('marginUsdCents')">
                  <span class="inline-flex items-center gap-1">
                    Margin
                    <component
                      :is="store.order === 'desc' ? ChevronDown : ChevronUp"
                      v-if="store.sort === 'marginUsdCents'"
                      class="size-3"
                    />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in users" :key="row.userId">
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
                      :indicator-class="utilizationTint(row.utilizationPercent)"
                    />
                    <div class="text-muted-foreground text-xs">
                      {{ formatPercent(row.utilizationPercent) }}
                    </div>
                  </div>
                  <span v-else class="text-muted-foreground text-xs">—</span>
                </TableCell>
                <TableCell>{{ formatUsdCents(row.estCostUsdCents) }}</TableCell>
                <TableCell>
                  <Badge :variant="marginVariant(row.marginUsdCents)">
                    {{ formatUsdCents(row.marginUsdCents) }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <!-- Pagination -->
        <div
          v-if="pagination && pagination.totalPages > 1"
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <p class="text-muted-foreground text-xs">
            {{ pagination.total }} users · page {{ pagination.page + 1 }} of
            {{ pagination.totalPages }}
          </p>
          <Pagination
            :total="pagination.total"
            :items-per-page="pagination.pageSize"
            :page="pagination.page + 1"
            :sibling-count="1"
            show-edges
            @update:page="changePage"
          >
            <PaginationList v-slot="{ items }" class="flex items-center gap-1">
              <PaginationFirst />
              <PaginationPrev />
              <template v-for="(item, index) in items" :key="index">
                <PaginationListItem v-if="item.type === 'page'" :value="item.value" as-child>
                  <Button
                    :variant="item.value === pagination.page + 1 ? 'default' : 'outline'"
                    size="icon"
                  >
                    {{ item.value }}
                  </Button>
                </PaginationListItem>
                <PaginationEllipsis v-else :index="index" />
              </template>
              <PaginationNext />
              <PaginationLast />
            </PaginationList>
          </Pagination>
        </div>
      </template>
    </div>
  </div>
</template>
