<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, FileText, MoreVertical, Plus } from 'lucide-vue-next'
import type { FormProfile } from '@quikfill/schemas'
import {
  Alert,
  Badge,
  Button,
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
  Textarea,
  toast,
} from '@quikfill/ui'
import { useFormProfilesStore } from '@/stores/formProfiles'
import { useDomainsStore } from '@/stores/domains'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { formProfileFormSchema, listToLines } from '@/schemas/forms'
import { relativeTime } from '@/lib/format'

const store = useFormProfilesStore()
const domains = useDomainsStore()
const { handleError } = useApiError()

const dialogOpen = ref(false)
const editing = ref<FormProfile | null>(null)
const confirmOpen = ref(false)
const deleteTarget = ref<FormProfile | null>(null)
const deleting = ref(false)

const { handleSubmit, defineField, errors, isSubmitting, resetForm } =
  useFormValidation(formProfileFormSchema)
const [domainId, domainIdAttrs] = defineField('domainId')
const [name, nameAttrs] = defineField('name')
const [urlPatterns, urlPatternsAttrs] = defineField('urlPatterns')
const [pageTitlePatterns, pageTitlePatternsAttrs] = defineField('pageTitlePatterns')

onMounted(async () => {
  try {
    await Promise.all([store.fetch(), domains.fetch()])
  } catch (error) {
    handleError(error)
  }
})

function domainName(id: string): string {
  return domains.items.find((domain) => domain.id === id)?.name ?? '—'
}

function matchBy(profile: FormProfile): string {
  if (profile.fieldFingerprintHash) return 'fingerprint'
  if (profile.urlPatterns.length) return 'url pattern'
  if (profile.pageTitlePatterns.length) return 'page title'
  return 'hostname'
}

function openCreate(): void {
  if (domains.items.length === 0) {
    toast.error('Create an app first.')
    return
  }
  editing.value = null
  resetForm({
    values: {
      domainId: domains.items[0].id,
      name: '',
      urlPatterns: '',
      pageTitlePatterns: '',
    },
  })
  dialogOpen.value = true
}

function openEdit(profile: FormProfile): void {
  editing.value = profile
  resetForm({
    values: {
      domainId: profile.domainId,
      name: profile.name,
      urlPatterns: listToLines(profile.urlPatterns),
      pageTitlePatterns: listToLines(profile.pageTitlePatterns),
    },
  })
  dialogOpen.value = true
}

const onSubmit = handleSubmit(async (values) => {
  try {
    if (editing.value) {
      await store.update(editing.value.id, {
        name: values.name,
        urlPatterns: values.urlPatterns,
        pageTitlePatterns: values.pageTitlePatterns,
      })
      toast.success('Profile updated')
    } else {
      await store.create({
        domainId: values.domainId,
        name: values.name,
        urlPatterns: values.urlPatterns,
        pageTitlePatterns: values.pageTitlePatterns,
      })
      toast.success('Profile created')
    }
    dialogOpen.value = false
  } catch (error) {
    handleError(error)
  }
})

function askDelete(profile: FormProfile): void {
  deleteTarget.value = profile
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await store.remove(deleteTarget.value.id)
    toast.success('Profile deleted')
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
        Form profiles are saved forms. Open one to review its field mappings.
      </p>
      <Button size="sm" @click="openCreate">
        <Plus class="size-4" />
        New profile
      </Button>
    </div>

    <div v-if="store.loading" class="space-y-2">
      <Skeleton v-for="n in 4" :key="n" class="h-14 w-full" />
    </div>

    <Alert v-else-if="store.items.length === 0" variant="info">
      <FileText />
      <div>
        <p class="font-semibold">No form profiles yet</p>
        <p>Profiles are usually captured by the extension, or you can add one here.</p>
      </div>
    </Alert>

    <TableContainer v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Form profile</TableHead>
            <TableHead>App</TableHead>
            <TableHead>Match by</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead class="w-px"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="profile in store.items" :key="profile.id">
            <TableCell>
              <RouterLink
                :to="`/form-profiles/${profile.id}`"
                class="hover:text-primary flex items-center gap-1.5 font-semibold"
              >
                {{ profile.name }}
                <ChevronRight class="text-muted-foreground size-4" />
              </RouterLink>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ domainName(profile.domainId) }}</TableCell>
            <TableCell
              ><Badge variant="info">{{ matchBy(profile) }}</Badge></TableCell
            >
            <TableCell class="text-muted-foreground">{{
              relativeTime(profile.updatedAt)
            }}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" aria-label="Actions">
                    <MoreVertical class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem @select="openEdit(profile)">Edit</DropdownMenuItem>
                  <DropdownMenuItem variant="danger" @select="askDelete(profile)"
                    >Delete</DropdownMenuItem
                  >
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>

    <Alert variant="info">
      <FileText />
      <div>
        Profiles match by hostname → URL pattern → page title → <strong>field fingerprint</strong> →
        structure similarity. Never URL alone.
      </div>
    </Alert>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ editing ? 'Edit profile' : 'New profile' }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="fp-domain">App</Label>
              <Select
                id="fp-domain"
                v-model="domainId"
                v-bind="domainIdAttrs"
                :disabled="!!editing"
                :aria-invalid="!!errors.domainId"
              >
                <option v-for="domain in domains.items" :key="domain.id" :value="domain.id">
                  {{ domain.name }}
                </option>
              </Select>
              <p v-if="errors.domainId" class="text-destructive mt-1.5 text-xs">
                {{ errors.domainId }}
              </p>
            </div>
            <div>
              <Label for="fp-name">Name</Label>
              <Input
                id="fp-name"
                v-model="name"
                v-bind="nameAttrs"
                placeholder="Job application"
                :aria-invalid="!!errors.name"
              />
              <p v-if="errors.name" class="text-destructive mt-1.5 text-xs">{{ errors.name }}</p>
            </div>
          </div>
          <div>
            <Label for="fp-urls">URL patterns</Label>
            <Textarea
              id="fp-urls"
              v-model="urlPatterns"
              v-bind="urlPatternsAttrs"
              placeholder="https://careers.example.com/apply/*"
            />
            <p class="text-muted-foreground mt-1.5 text-xs">One pattern per line.</p>
          </div>
          <div>
            <Label for="fp-titles">Page title patterns</Label>
            <Textarea
              id="fp-titles"
              v-model="pageTitlePatterns"
              v-bind="pageTitlePatternsAttrs"
              placeholder="Apply for*"
            />
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="dialogOpen = false">Cancel</Button>
            <Button type="submit" :disabled="isSubmitting">
              {{ editing ? 'Save changes' : 'Create profile' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete profile?"
      :description="`“${deleteTarget?.name}” and its field mappings will be removed.`"
      confirm-label="Delete"
      :pending="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
