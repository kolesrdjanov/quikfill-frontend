<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import { ArrowLeft, MoreVertical } from 'lucide-vue-next'
import {
  fillSourceSchema,
  fillSourceTypeSchema,
  fillStrategySchema,
  type FieldMapping,
  type FillSource,
  type FillSourceType,
  type FillStrategy,
} from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@quikfill/ui'
import { useFormProfilesStore } from '@/stores/formProfiles'
import { useApiError } from '@/composables/useApiError'
import { formatDateTime } from '@/lib/format'

const route = useRoute()
const store = useFormProfilesStore()
const { handleError } = useApiError()

const strategies = fillStrategySchema.options
const sourceTypes = fillSourceTypeSchema.options.filter((type) => type !== 'composed')

const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const editStrategy = ref<FillStrategy>('nativeInput')
const editConfidence = ref('0')
const sourceType = ref<FillSourceType>('staticValue')
const saving = ref(false)
const src = reactive({
  entityTypeId: '',
  recordId: '',
  fieldKey: '',
  presetId: '',
  ruleKey: '',
  value: '',
  promptLabel: '',
  hint: '',
})

const confirmOpen = ref(false)
const deleteTarget = ref<FieldMapping | null>(null)
const deleting = ref(false)

onMounted(() => {
  const id = route.params.id
  if (typeof id === 'string') void store.fetchDetail(id).catch(handleError)
})

function sourceSummary(source: FillSource): string {
  switch (source.sourceType) {
    case 'recordField':
      return `record · ${source.fieldKey}`
    case 'generatorRule':
      return `generator · ${source.ruleKey}`
    case 'staticValue':
      return `static · ${source.value}`
    case 'runtimeValue':
      return `prompt · ${source.promptLabel}`
    case 'aiGenerated':
      return `AI · ${source.hint}`
    case 'composed':
      return 'composed'
  }
}

function sourceVariant(type: FillSourceType): 'primary' | 'info' | 'warning' | 'gray' {
  if (type === 'recordField') return 'primary'
  if (type === 'generatorRule') return 'info'
  if (type === 'aiGenerated') return 'warning'
  return 'gray'
}

function openEdit(mapping: FieldMapping): void {
  editingId.value = mapping.id
  editStrategy.value = mapping.fillStrategy
  editConfidence.value = String(mapping.confidence)
  const source = mapping.fillSource
  sourceType.value = source.sourceType === 'composed' ? 'staticValue' : source.sourceType
  Object.assign(src, {
    entityTypeId: '',
    recordId: '',
    fieldKey: '',
    presetId: '',
    ruleKey: '',
    value: '',
    promptLabel: '',
    hint: '',
  })
  if (source.sourceType === 'recordField') {
    src.entityTypeId = source.entityTypeId
    src.recordId = source.recordId ?? ''
    src.fieldKey = source.fieldKey
  } else if (source.sourceType === 'generatorRule') {
    src.presetId = source.presetId ?? ''
    src.ruleKey = source.ruleKey
  } else if (source.sourceType === 'staticValue') {
    src.value = source.value
  } else if (source.sourceType === 'runtimeValue') {
    src.promptLabel = source.promptLabel
  } else if (source.sourceType === 'aiGenerated') {
    src.hint = source.hint
  }
  dialogOpen.value = true
}

function buildSource(): FillSource | null {
  switch (sourceType.value) {
    case 'recordField':
      return {
        sourceType: 'recordField',
        entityTypeId: src.entityTypeId,
        recordId: src.recordId || undefined,
        fieldKey: src.fieldKey,
      }
    case 'generatorRule':
      return {
        sourceType: 'generatorRule',
        presetId: src.presetId || undefined,
        ruleKey: src.ruleKey,
      }
    case 'staticValue':
      return { sourceType: 'staticValue', value: src.value }
    case 'runtimeValue':
      return { sourceType: 'runtimeValue', promptLabel: src.promptLabel }
    case 'aiGenerated':
      return { sourceType: 'aiGenerated', hint: src.hint }
    default:
      return null
  }
}

async function saveMapping(): Promise<void> {
  if (!editingId.value) return
  const confidence = Number(editConfidence.value)
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    toast.error('Confidence must be between 0 and 1.')
    return
  }
  const source = buildSource()
  const parsed = fillSourceSchema.safeParse(source)
  if (!parsed.success) {
    toast.error('Fill source is incomplete for the chosen type.')
    return
  }
  saving.value = true
  try {
    await store.updateMapping(editingId.value, {
      fillStrategy: editStrategy.value,
      confidence,
      fillSource: parsed.data,
    })
    toast.success('Mapping updated')
    dialogOpen.value = false
  } catch (error) {
    handleError(error)
  } finally {
    saving.value = false
  }
}

function askDelete(mapping: FieldMapping): void {
  deleteTarget.value = mapping
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await store.removeMapping(deleteTarget.value.id)
    toast.success('Mapping deleted')
    confirmOpen.value = false
  } catch (error) {
    handleError(error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <RouterLink
      to="/form-profiles"
      class="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm font-medium"
    >
      <ArrowLeft class="size-4" />
      Form profiles
    </RouterLink>

    <div v-if="store.detailLoading" class="space-y-3">
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <template v-else-if="store.current">
      <Card>
        <CardContent class="space-y-3">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold tracking-tight">{{ store.current.name }}</h2>
              <p class="text-muted-foreground mt-0.5 text-sm">
                {{ store.mappings.length }} field mappings
              </p>
            </div>
            <Badge v-if="store.current.fieldFingerprintHash" variant="info">fingerprint</Badge>
          </div>
          <div v-if="store.current.urlPatterns.length" class="flex flex-wrap gap-1.5">
            <Badge
              v-for="url in store.current.urlPatterns"
              :key="url"
              variant="gray"
              class="font-mono"
            >
              {{ url }}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Alert v-if="store.mappings.length === 0" variant="info">
        <div>
          <p class="font-semibold">No mappings yet</p>
          <p>The extension adds field mappings when it saves this form.</p>
        </div>
      </Alert>

      <TableContainer v-else>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field fingerprint</TableHead>
              <TableHead>Fill source</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Last fill</TableHead>
              <TableHead class="w-px"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="mapping in store.mappings" :key="mapping.id">
              <TableCell class="max-w-[180px] truncate font-mono text-xs">
                {{ mapping.fieldFingerprint }}
              </TableCell>
              <TableCell>
                <Badge :variant="sourceVariant(mapping.fillSource.sourceType)">
                  {{ sourceSummary(mapping.fillSource) }}
                </Badge>
              </TableCell>
              <TableCell class="font-mono text-xs">{{ mapping.fillStrategy }}</TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <div class="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                    <div
                      class="bg-primary h-full rounded-full"
                      :style="{ width: `${Math.round(mapping.confidence * 100)}%` }"
                    />
                  </div>
                  <span class="text-muted-foreground text-xs tabular-nums">
                    {{ Math.round(mapping.confidence * 100) }}%
                  </span>
                </div>
              </TableCell>
              <TableCell class="text-muted-foreground text-xs">
                {{ formatDateTime(mapping.lastSuccessfulFillAt) }}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Actions">
                      <MoreVertical class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem @select="openEdit(mapping)">Edit mapping</DropdownMenuItem>
                    <DropdownMenuItem variant="danger" @select="askDelete(mapping)">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </template>

    <Alert v-else variant="danger">
      <div>This form profile could not be loaded.</div>
    </Alert>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit field mapping</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit.prevent="saveMapping">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="m-strategy">Fill strategy</Label>
              <Select id="m-strategy" v-model="editStrategy">
                <option v-for="strategy in strategies" :key="strategy" :value="strategy">
                  {{ strategy }}
                </option>
              </Select>
            </div>
            <div>
              <Label for="m-confidence">Confidence (0–1)</Label>
              <Input id="m-confidence" v-model="editConfidence" type="number" />
            </div>
          </div>

          <div>
            <Label for="m-source">Fill source</Label>
            <Select id="m-source" v-model="sourceType">
              <option v-for="type in sourceTypes" :key="type" :value="type">{{ type }}</option>
            </Select>
          </div>

          <div class="bg-muted/40 grid gap-3 rounded-lg p-3 sm:grid-cols-2">
            <template v-if="sourceType === 'recordField'">
              <div>
                <Label for="m-et">Entity type id</Label>
                <Input id="m-et" v-model="src.entityTypeId" />
              </div>
              <div>
                <Label for="m-fk">Field key</Label>
                <Input id="m-fk" v-model="src.fieldKey" />
              </div>
              <div class="sm:col-span-2">
                <Label for="m-rec">Record id (optional)</Label>
                <Input id="m-rec" v-model="src.recordId" />
              </div>
            </template>
            <template v-else-if="sourceType === 'generatorRule'">
              <div>
                <Label for="m-rule">Rule key</Label>
                <Input id="m-rule" v-model="src.ruleKey" />
              </div>
              <div>
                <Label for="m-preset">Preset id (optional)</Label>
                <Input id="m-preset" v-model="src.presetId" />
              </div>
            </template>
            <div v-else-if="sourceType === 'staticValue'" class="sm:col-span-2">
              <Label for="m-static">Static value</Label>
              <Input id="m-static" v-model="src.value" />
            </div>
            <div v-else-if="sourceType === 'runtimeValue'" class="sm:col-span-2">
              <Label for="m-prompt">Prompt label</Label>
              <Input id="m-prompt" v-model="src.promptLabel" />
            </div>
            <div v-else-if="sourceType === 'aiGenerated'" class="sm:col-span-2">
              <Label for="m-hint">AI hint</Label>
              <Input id="m-hint" v-model="src.hint" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="dialogOpen = false">Cancel</Button>
            <Button type="submit" :disabled="saving">Save mapping</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete mapping?"
      description="This field mapping will be removed. This cannot be undone."
      confirm-label="Delete"
      :pending="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
