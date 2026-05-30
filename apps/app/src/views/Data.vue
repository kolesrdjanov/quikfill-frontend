<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Database, MoreVertical, Plus, Trash2 } from 'lucide-vue-next'
import type { EntityFieldDef, EntityFieldType, EntityRecord, EntityType } from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@quikfill/ui'
import { useEntityTypesStore } from '@/stores/entityTypes'
import { useEntityRecordsStore } from '@/stores/entityRecords'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { entityFieldTypes, entityRecordMetaSchema, entityTypeFormSchema } from '@/schemas/forms'

const typesStore = useEntityTypesStore()
const recordsStore = useEntityRecordsStore()
const { handleError } = useApiError()

const tab = ref('records')

onMounted(async () => {
  try {
    await Promise.all([typesStore.fetch(), recordsStore.fetch()])
  } catch (error) {
    handleError(error)
  }
})

function typeName(id: string): string {
  return typesStore.items.find((type) => type.id === id)?.name ?? 'Unknown type'
}

/* ── Entity records ───────────────────────────────────────────────────────── */
const recordDialog = ref(false)
const editingRecord = ref<EntityRecord | null>(null)
const recordValues = ref<Record<string, unknown>>({})

const recordForm = useFormValidation(entityRecordMetaSchema)
const [recordTypeId, recordTypeIdAttrs] = recordForm.defineField('entityTypeId')
const [recordName, recordNameAttrs] = recordForm.defineField('name')

const selectedTypeFields = computed<EntityFieldDef[]>(
  () => typesStore.items.find((type) => type.id === recordTypeId.value)?.fields ?? [],
)

function seedValues(fields: EntityFieldDef[], existing?: Record<string, unknown>): void {
  const next: Record<string, unknown> = {}
  for (const field of fields) {
    next[field.key] = existing?.[field.key] ?? (field.type === 'boolean' ? false : '')
  }
  recordValues.value = next
}

function openRecordCreate(): void {
  if (typesStore.items.length === 0) {
    toast.error('Create an entity type first.')
    tab.value = 'types'
    return
  }
  editingRecord.value = null
  const firstType = typesStore.items[0]
  recordForm.resetForm({ values: { entityTypeId: firstType.id, name: '' } })
  seedValues(firstType.fields)
  recordDialog.value = true
}

function openRecordEdit(record: EntityRecord): void {
  editingRecord.value = record
  recordForm.resetForm({ values: { entityTypeId: record.entityTypeId, name: record.name } })
  const fields = typesStore.items.find((type) => type.id === record.entityTypeId)?.fields ?? []
  seedValues(fields, record.values)
  recordDialog.value = true
}

function onTypeChange(): void {
  if (!editingRecord.value) seedValues(selectedTypeFields.value)
}

const submitRecord = recordForm.handleSubmit(async (values) => {
  const cleanValues: Record<string, unknown> = {}
  for (const field of selectedTypeFields.value) {
    const raw = recordValues.value[field.key]
    if (field.type === 'number') {
      cleanValues[field.key] = raw === '' || raw === null ? null : Number(raw)
    } else {
      cleanValues[field.key] = raw
    }
  }
  try {
    if (editingRecord.value) {
      await recordsStore.update(editingRecord.value.id, { name: values.name, values: cleanValues })
      toast.success('Record updated')
    } else {
      await recordsStore.create({
        entityTypeId: values.entityTypeId,
        name: values.name,
        values: cleanValues,
      })
      toast.success('Record created')
    }
    recordDialog.value = false
  } catch (error) {
    handleError(error)
  }
})

/* ── Entity types ─────────────────────────────────────────────────────────── */
const typeDialog = ref(false)
const editingType = ref<EntityType | null>(null)
const typeFields = ref<EntityFieldDef[]>([])

const typeForm = useFormValidation(entityTypeFormSchema)
const [typeName2, typeNameAttrs] = typeForm.defineField('name')
const [typeDescription, typeDescriptionAttrs] = typeForm.defineField('description')

function openTypeCreate(): void {
  editingType.value = null
  typeFields.value = [{ key: '', label: '', type: 'text', required: false }]
  typeForm.resetForm({ values: { name: '', description: '' } })
  typeDialog.value = true
}

function openTypeEdit(type: EntityType): void {
  editingType.value = type
  typeFields.value = type.fields.map((field) => ({ ...field }))
  typeForm.resetForm({ values: { name: type.name, description: type.description ?? '' } })
  typeDialog.value = true
}

const submitType = typeForm.handleSubmit(async (values) => {
  const fields = typeFields.value.filter((field) => field.key.trim() && field.label.trim())
  if (fields.length === 0) {
    toast.error('Add at least one field with a key and label.')
    return
  }
  const input = { name: values.name, description: values.description || undefined, fields }
  try {
    if (editingType.value) {
      await typesStore.update(editingType.value.id, input)
      toast.success('Type updated')
    } else {
      await typesStore.create(input)
      toast.success('Type created')
    }
    typeDialog.value = false
  } catch (error) {
    handleError(error)
  }
})

/* ── Deletion (shared) ────────────────────────────────────────────────────── */
const confirmOpen = ref(false)
const deleting = ref(false)
const deleteKind = ref<'record' | 'type'>('record')
const deleteRecord = ref<EntityRecord | null>(null)
const deleteType = ref<EntityType | null>(null)

function askDeleteRecord(record: EntityRecord): void {
  deleteKind.value = 'record'
  deleteRecord.value = record
  confirmOpen.value = true
}
function askDeleteType(type: EntityType): void {
  deleteKind.value = 'type'
  deleteType.value = type
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  deleting.value = true
  try {
    if (deleteKind.value === 'record' && deleteRecord.value) {
      await recordsStore.remove(deleteRecord.value.id)
    } else if (deleteKind.value === 'type' && deleteType.value) {
      await typesStore.remove(deleteType.value.id)
    }
    toast.success('Deleted')
    confirmOpen.value = false
  } catch (error) {
    handleError(error)
  } finally {
    deleting.value = false
  }
}

const fieldTypeOptions = entityFieldTypes as readonly EntityFieldType[]
</script>

<template>
  <div class="space-y-5">
    <Tabs v-model="tab">
      <div class="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="types">Entity types</TabsTrigger>
        </TabsList>
        <Button v-if="tab === 'records'" size="sm" @click="openRecordCreate">
          <Plus class="size-4" />
          New record
        </Button>
        <Button v-else size="sm" @click="openTypeCreate">
          <Plus class="size-4" />
          New type
        </Button>
      </div>

      <!-- Records -->
      <TabsContent value="records" class="mt-5">
        <div v-if="recordsStore.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton v-for="n in 3" :key="n" class="h-40 w-full" />
        </div>
        <Alert v-else-if="recordsStore.items.length === 0" variant="info">
          <Database />
          <div>
            <p class="font-semibold">No records yet</p>
            <p>Records hold the values QuikFill uses to fill forms.</p>
          </div>
        </Alert>
        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card v-for="record in recordsStore.items" :key="record.id">
            <CardContent class="space-y-3">
              <div class="flex items-start justify-between">
                <div>
                  <div class="font-bold">{{ record.name }}</div>
                  <div class="text-muted-foreground text-xs">
                    {{ typeName(record.entityTypeId) }}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Actions">
                      <MoreVertical class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem @select="openRecordEdit(record)">Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="danger" @select="askDeleteRecord(record)">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <dl class="space-y-1.5">
                <div
                  v-for="(value, key) in record.values"
                  :key="key"
                  class="flex justify-between gap-3 border-t border-dashed pt-1.5 text-[13px] first:border-0 first:pt-0"
                >
                  <dt class="text-muted-foreground">{{ key }}</dt>
                  <dd class="truncate font-mono">{{ String(value) }}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- Entity types -->
      <TabsContent value="types" class="mt-5">
        <div v-if="typesStore.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton v-for="n in 3" :key="n" class="h-32 w-full" />
        </div>
        <Alert v-else-if="typesStore.items.length === 0" variant="info">
          <Database />
          <div>
            <p class="font-semibold">No entity types yet</p>
            <p>Define a shape (e.g. Person, Address) before adding records.</p>
          </div>
        </Alert>
        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card v-for="type in typesStore.items" :key="type.id">
            <CardContent class="space-y-3">
              <div class="flex items-start justify-between">
                <div>
                  <div class="font-bold">{{ type.name }}</div>
                  <div class="text-muted-foreground text-xs">{{ type.fields.length }} fields</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Actions">
                      <MoreVertical class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem @select="openTypeEdit(type)">Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="danger" @select="askDeleteType(type)">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Badge v-for="field in type.fields" :key="field.key" variant="gray">
                  {{ field.label }}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    <!-- Record dialog -->
    <Dialog v-model:open="recordDialog">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ editingRecord ? 'Edit record' : 'New record' }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit="submitRecord">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="rec-type">Entity type</Label>
              <Select
                id="rec-type"
                v-model="recordTypeId"
                v-bind="recordTypeIdAttrs"
                :disabled="!!editingRecord"
                @change="onTypeChange"
              >
                <option v-for="type in typesStore.items" :key="type.id" :value="type.id">
                  {{ type.name }}
                </option>
              </Select>
            </div>
            <div>
              <Label for="rec-name">Record name</Label>
              <Input
                id="rec-name"
                v-model="recordName"
                v-bind="recordNameAttrs"
                placeholder="Personal — Jane"
                :aria-invalid="!!recordForm.errors.value.name"
              />
            </div>
          </div>

          <div v-if="selectedTypeFields.length" class="space-y-3 border-t pt-4">
            <p class="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
              Values
            </p>
            <div v-for="field in selectedTypeFields" :key="field.key">
              <Label :for="`val-${field.key}`">
                {{ field.label }}
                <span v-if="field.required" class="text-destructive">*</span>
              </Label>
              <Checkbox
                v-if="field.type === 'boolean'"
                :id="`val-${field.key}`"
                :model-value="recordValues[field.key] as boolean"
                @update:model-value="recordValues[field.key] = $event"
              />
              <Textarea
                v-else-if="field.type === 'notes'"
                :id="`val-${field.key}`"
                :model-value="recordValues[field.key] as string"
                @update:model-value="recordValues[field.key] = $event"
              />
              <Select
                v-else-if="field.type === 'enum'"
                :id="`val-${field.key}`"
                :model-value="recordValues[field.key] as string"
                @update:model-value="recordValues[field.key] = $event"
              >
                <option value="">—</option>
                <option v-for="opt in field.options ?? []" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </Select>
              <Input
                v-else
                :id="`val-${field.key}`"
                :model-value="recordValues[field.key] as string"
                :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
                @update:model-value="recordValues[field.key] = $event"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="recordDialog = false">Cancel</Button>
            <Button type="submit" :disabled="recordForm.isSubmitting.value">
              {{ editingRecord ? 'Save changes' : 'Create record' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Type dialog -->
    <Dialog v-model:open="typeDialog">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ editingType ? 'Edit entity type' : 'New entity type' }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit="submitType">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="type-name">Name</Label>
              <Input
                id="type-name"
                v-model="typeName2"
                v-bind="typeNameAttrs"
                placeholder="Person"
                :aria-invalid="!!typeForm.errors.value.name"
              />
            </div>
            <div>
              <Label for="type-desc">Description</Label>
              <Input
                id="type-desc"
                v-model="typeDescription"
                v-bind="typeDescriptionAttrs"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <Label class="mb-0">Fields</Label>
              <Button
                type="button"
                variant="soft"
                size="sm"
                @click="typeFields.push({ key: '', label: '', type: 'text', required: false })"
              >
                <Plus class="size-3.5" />
                Add field
              </Button>
            </div>
            <div class="space-y-2">
              <div
                v-for="(field, index) in typeFields"
                :key="index"
                class="flex flex-wrap items-center gap-2"
              >
                <Input v-model="field.key" placeholder="key" class="w-32" />
                <Input v-model="field.label" placeholder="Label" class="flex-1" />
                <Select v-model="field.type" class="w-36">
                  <option v-for="ft in fieldTypeOptions" :key="ft" :value="ft">{{ ft }}</option>
                </Select>
                <label class="flex items-center gap-1.5 text-[13px]">
                  <Checkbox v-model="field.required" />
                  req
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove field"
                  @click="typeFields.splice(index, 1)"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="typeDialog = false">Cancel</Button>
            <Button type="submit" :disabled="typeForm.isSubmitting.value">
              {{ editingType ? 'Save changes' : 'Create type' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete?"
      description="This cannot be undone. Deleting a type also deletes its records."
      confirm-label="Delete"
      :pending="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
