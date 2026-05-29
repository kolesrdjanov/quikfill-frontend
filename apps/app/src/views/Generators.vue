<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Dices, MoreVertical, Plus, Trash2 } from 'lucide-vue-next'
import type { GeneratorKind, GeneratorPreset } from '@quikfill/schemas'
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
  toast,
} from '@quikfill/ui'
import { useGeneratorPresetsStore } from '@/stores/generatorPresets'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { generatorKinds, generatorPresetFormSchema } from '@/schemas/forms'

const store = useGeneratorPresetsStore()
const { handleError } = useApiError()

const dialogOpen = ref(false)
const editing = ref<GeneratorPreset | null>(null)
const rules = ref<{ fieldKey: string; kind: GeneratorKind }[]>([])
const confirmOpen = ref(false)
const deleteTarget = ref<GeneratorPreset | null>(null)
const deleting = ref(false)

const { handleSubmit, defineField, errors, isSubmitting, resetForm } =
  useFormValidation(generatorPresetFormSchema)
const [name, nameAttrs] = defineField('name')
const [locale, localeAttrs] = defineField('locale')
const [seedMode, seedModeAttrs] = defineField('seedMode')
const [seed, seedAttrs] = defineField('seed')

onMounted(() => void store.fetch().catch(handleError))

function openCreate(): void {
  editing.value = null
  rules.value = [{ fieldKey: '', kind: 'person' }]
  resetForm({ values: { name: '', locale: 'en', seedMode: 'random', seed: '' } })
  dialogOpen.value = true
}

function openEdit(preset: GeneratorPreset): void {
  editing.value = preset
  rules.value = preset.rules.map((rule) => ({ fieldKey: rule.fieldKey, kind: rule.kind }))
  resetForm({
    values: {
      name: preset.name,
      locale: preset.locale,
      seedMode: preset.seedMode,
      seed: preset.seed ?? '',
    },
  })
  dialogOpen.value = true
}

const onSubmit = handleSubmit(async (values) => {
  const cleanRules = rules.value.filter((rule) => rule.fieldKey.trim().length > 0)
  if (cleanRules.length === 0) {
    toast.error('Add at least one rule with a field key.')
    return
  }
  const input = {
    name: values.name,
    locale: values.locale,
    seedMode: values.seedMode,
    seed: values.seedMode === 'seeded' ? values.seed || undefined : undefined,
    rules: cleanRules,
  }
  try {
    if (editing.value) {
      await store.update(editing.value.id, input)
      toast.success('Generator updated')
    } else {
      await store.create(input)
      toast.success('Generator created')
    }
    dialogOpen.value = false
  } catch (error) {
    handleError(error)
  }
})

function askDelete(preset: GeneratorPreset): void {
  deleteTarget.value = preset
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await store.remove(deleteTarget.value.id)
    toast.success('Generator deleted')
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
    <div class="flex items-center justify-between gap-3">
      <p class="text-muted-foreground text-sm">
        Generator presets produce fake-but-valid values (test personas, QA data) for fills.
      </p>
      <Button size="sm" @click="openCreate">
        <Plus class="size-4" />
        New generator
      </Button>
    </div>

    <div v-if="store.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="n in 3" :key="n" class="h-36 w-full" />
    </div>

    <Alert v-else-if="store.items.length === 0" variant="info">
      <Dices />
      <div>
        <p class="font-semibold">No generators yet</p>
        <p>Create a preset to generate values for forms.</p>
      </div>
    </Alert>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card v-for="preset in store.items" :key="preset.id">
        <CardContent class="space-y-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2.5">
              <span class="bg-info/15 text-info flex size-9 items-center justify-center rounded-lg">
                <Dices class="size-4" />
              </span>
              <div>
                <div class="font-bold">{{ preset.name }}</div>
                <div class="text-muted-foreground text-xs">Generator preset</div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Actions">
                  <MoreVertical class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem @select="openEdit(preset)">Edit</DropdownMenuItem>
                <DropdownMenuItem variant="danger" @select="askDelete(preset)"
                  >Delete</DropdownMenuItem
                >
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <Badge variant="primary" class="font-mono">{{ preset.locale }}</Badge>
            <Badge variant="gray">{{ preset.seedMode }}</Badge>
            <Badge variant="gray">{{ preset.rules.length }} rules</Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ editing ? 'Edit generator' : 'New generator' }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="gen-name">Name</Label>
              <Input
                id="gen-name"
                v-model="name"
                v-bind="nameAttrs"
                placeholder="Test persona (US)"
                :aria-invalid="!!errors.name"
              />
              <p v-if="errors.name" class="text-destructive mt-1.5 text-xs">{{ errors.name }}</p>
            </div>
            <div>
              <Label for="gen-locale">Locale</Label>
              <Input id="gen-locale" v-model="locale" v-bind="localeAttrs" placeholder="en-US" />
            </div>
            <div>
              <Label for="gen-seedmode">Seed mode</Label>
              <Select id="gen-seedmode" v-model="seedMode" v-bind="seedModeAttrs">
                <option value="random">random</option>
                <option value="seeded">seeded</option>
              </Select>
            </div>
            <div v-if="seedMode === 'seeded'">
              <Label for="gen-seed">Seed</Label>
              <Input id="gen-seed" v-model="seed" v-bind="seedAttrs" placeholder="seed value" />
            </div>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <Label class="mb-0">Rules</Label>
              <Button
                type="button"
                variant="soft"
                size="sm"
                @click="rules.push({ fieldKey: '', kind: 'person' })"
              >
                <Plus class="size-3.5" />
                Add rule
              </Button>
            </div>
            <div class="space-y-2">
              <div v-for="(rule, index) in rules" :key="index" class="flex items-center gap-2">
                <Input
                  v-model="rule.fieldKey"
                  placeholder="fieldKey (e.g. firstName)"
                  class="flex-1"
                />
                <Select v-model="rule.kind" class="w-44">
                  <option v-for="kind in generatorKinds" :key="kind" :value="kind">
                    {{ kind }}
                  </option>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove rule"
                  @click="rules.splice(index, 1)"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="dialogOpen = false">Cancel</Button>
            <Button type="submit" :disabled="isSubmitting">
              {{ editing ? 'Save changes' : 'Create generator' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete generator?"
      :description="`“${deleteTarget?.name}” will be removed. This cannot be undone.`"
      confirm-label="Delete"
      :pending="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
