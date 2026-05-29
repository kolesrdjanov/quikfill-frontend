<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Database, Dices, FileText, Globe } from 'lucide-vue-next'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@quikfill/ui'
import { useDomainsStore } from '@/stores/domains'
import { useFormProfilesStore } from '@/stores/formProfiles'
import { useEntityRecordsStore } from '@/stores/entityRecords'
import { useGeneratorPresetsStore } from '@/stores/generatorPresets'
import { useFillRunsStore } from '@/stores/fillRuns'
import { useApiError } from '@/composables/useApiError'
import { relativeTime } from '@/lib/format'

const domains = useDomainsStore()
const profiles = useFormProfilesStore()
const records = useEntityRecordsStore()
const generators = useGeneratorPresetsStore()
const fillRuns = useFillRunsStore()
const { handleError } = useApiError()

const loading = computed(
  () => profiles.loading || domains.loading || records.loading || generators.loading,
)

onMounted(async () => {
  try {
    await Promise.all([
      profiles.fetch(),
      domains.fetch(),
      records.fetch(),
      generators.fetch(),
      fillRuns.fetch({ limit: 6 }),
    ])
  } catch (error) {
    handleError(error)
  }
})

const kpis = computed(() => [
  { label: 'Form profiles', value: profiles.items.length, to: '/form-profiles', icon: FileText },
  { label: 'Apps', value: domains.items.length, to: '/apps', icon: Globe },
  { label: 'Records', value: records.items.length, to: '/data', icon: Database },
  { label: 'Generators', value: generators.items.length, to: '/generators', icon: Dices },
])

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'gray' {
  if (status === 'success') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'failed') return 'danger'
  return 'gray'
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton v-for="n in 4" :key="n" class="h-28 w-full" />
    </div>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <RouterLink v-for="kpi in kpis" :key="kpi.label" :to="kpi.to">
        <Card class="hover:border-primary/40 transition-colors">
          <CardContent class="space-y-3">
            <span
              class="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg"
            >
              <component :is="kpi.icon" class="size-5" />
            </span>
            <div>
              <div class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                {{ kpi.label }}
              </div>
              <div class="mt-0.5 text-3xl font-extrabold tabular-nums">{{ kpi.value }}</div>
            </div>
          </CardContent>
        </Card>
      </RouterLink>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Recent fills</CardTitle>
        <RouterLink
          to="/fill-history"
          class="text-muted-foreground hover:text-primary flex items-center gap-1 text-sm font-medium"
        >
          View all
          <ArrowRight class="size-4" />
        </RouterLink>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="fillRuns.loading" class="space-y-2 p-5">
          <Skeleton v-for="n in 3" :key="n" class="h-12 w-full" />
        </div>
        <Alert v-else-if="fillRuns.items.length === 0" variant="info" class="m-5">
          <div>No fills yet — they'll show up here once the extension runs.</div>
        </Alert>
        <ul v-else class="divide-y">
          <li
            v-for="run in fillRuns.items"
            :key="run.id"
            class="flex items-center justify-between gap-3 px-5 py-3.5"
          >
            <div class="min-w-0">
              <div class="truncate font-mono text-[13px]">{{ host(run.url) }}</div>
              <div class="text-muted-foreground text-xs">{{ relativeTime(run.startedAt) }}</div>
            </div>
            <Badge :variant="statusVariant(run.status)">{{ run.status }}</Badge>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
