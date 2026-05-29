<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { History } from 'lucide-vue-next'
import type { FillRun, FillRunStatus } from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Button,
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
import { useFillRunsStore } from '@/stores/fillRuns'
import { useApiError } from '@/composables/useApiError'
import { formatDateTime } from '@/lib/format'

const store = useFillRunsStore()
const { handleError } = useApiError()

const filter = ref<'all' | FillRunStatus>('all')
const limit = ref(25)

async function load(): Promise<void> {
  try {
    await store.fetch({ limit: limit.value })
  } catch (error) {
    handleError(error)
  }
}

onMounted(load)

const filtered = computed<FillRun[]>(() =>
  filter.value === 'all' ? store.items : store.items.filter((run) => run.status === filter.value),
)

function statusVariant(status: FillRunStatus): 'success' | 'warning' | 'danger' | 'gray' {
  if (status === 'success') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'failed') return 'danger'
  return 'gray'
}

function successCount(run: FillRun): number {
  return run.results.filter((result) => result.status === 'success').length
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function loadMore(): Promise<void> {
  limit.value += 25
  await load()
}
</script>

<template>
  <div class="space-y-5">
    <Tabs v-model="filter">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="success">Success</TabsTrigger>
        <TabsTrigger value="partial">Partial</TabsTrigger>
        <TabsTrigger value="failed">Failed</TabsTrigger>
      </TabsList>
    </Tabs>

    <div v-if="store.loading && store.items.length === 0" class="space-y-2">
      <Skeleton v-for="n in 5" :key="n" class="h-14 w-full" />
    </div>

    <Alert v-else-if="filtered.length === 0" variant="info">
      <History />
      <div>
        <p class="font-semibold">No fill runs</p>
        <p>Fill history appears here once the extension fills forms.</p>
      </div>
    </Alert>

    <template v-else>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="run in filtered" :key="run.id">
              <TableCell class="text-muted-foreground whitespace-nowrap">
                {{ formatDateTime(run.startedAt) }}
              </TableCell>
              <TableCell class="font-mono text-xs">{{ host(run.url) }}</TableCell>
              <TableCell
                ><Badge variant="gray">{{ run.mode }}</Badge></TableCell
              >
              <TableCell class="tabular-nums">
                {{ successCount(run) }} / {{ run.plan.length }}
              </TableCell>
              <TableCell>
                <Badge :variant="statusVariant(run.status)">{{ run.status }}</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <div v-if="store.items.length >= limit" class="flex justify-center">
        <Button variant="outline" size="sm" :disabled="store.loading" @click="loadMore">
          {{ store.loading ? 'Loading…' : 'Load more' }}
        </Button>
      </div>
    </template>
  </div>
</template>
