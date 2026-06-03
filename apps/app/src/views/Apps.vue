<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Globe, MoreVertical, Plus } from 'lucide-vue-next'
import type { Domain } from '@quikfill/schemas'
import {
  Alert,
  Avatar,
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
import { useDomainsStore } from '@/stores/domains'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { domainFormSchema, linesToList, listToLines } from '@/schemas/forms'

const store = useDomainsStore()
const { handleError } = useApiError()

const dialogOpen = ref(false)
const editing = ref<Domain | null>(null)
const confirmOpen = ref(false)
const deleteTarget = ref<Domain | null>(null)
const deleting = ref(false)

const { handleSubmit, defineField, errors, isSubmitting, resetForm } =
  useFormValidation(domainFormSchema)
const [name, nameAttrs] = defineField('name')
const [hostnames, hostnamesAttrs] = defineField('hostnames')
const [description, descriptionAttrs] = defineField('description')

onMounted(() => void store.fetch().catch(handleError))

function openCreate(): void {
  editing.value = null
  resetForm({ values: { name: '', hostnames: '', description: '' } })
  dialogOpen.value = true
}

function openEdit(domain: Domain): void {
  editing.value = domain
  resetForm({
    values: {
      name: domain.name,
      hostnames: listToLines(domain.hostnames),
      description: domain.description ?? '',
    },
  })
  dialogOpen.value = true
}

const onSubmit = handleSubmit(async (values) => {
  const input = {
    name: values.name,
    hostnames: linesToList(values.hostnames),
    description: values.description || undefined,
  }
  try {
    if (editing.value) {
      await store.update(editing.value.id, input)
      toast.success('App updated')
    } else {
      await store.create(input)
      toast.success('App created')
    }
    dialogOpen.value = false
  } catch (error) {
    handleError(error)
  }
})

function askDelete(domain: Domain): void {
  deleteTarget.value = domain
  confirmOpen.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await store.remove(deleteTarget.value.id)
    toast.success('App deleted')
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
        Apps group the sites where your forms live. Each app holds one or more form profiles.
      </p>
      <Button size="sm" @click="openCreate">
        <Plus class="size-4" />
        New app
      </Button>
    </div>

    <div v-if="store.loading" class="space-y-2">
      <Skeleton v-for="n in 4" :key="n" class="h-14 w-full" />
    </div>

    <Alert v-else-if="store.items.length === 0" variant="info">
      <Globe />
      <div>
        <p class="font-semibold">No apps yet</p>
        <p>Add the first site you want QuikFill to recognise.</p>
      </div>
    </Alert>

    <TableContainer v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>App</TableHead>
            <TableHead>Hostnames</TableHead>
            <TableHead class="w-px"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="domain in store.items" :key="domain.id">
            <TableCell>
              <div class="flex items-center gap-3">
                <Avatar class="bg-accent text-accent-foreground size-9"
                  ><Globe class="size-4"
                /></Avatar>
                <div>
                  <div class="font-semibold">{{ domain.name }}</div>
                  <div v-if="domain.description" class="text-muted-foreground text-xs">
                    {{ domain.description }}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="host in domain.hostnames"
                  :key="host"
                  variant="gray"
                  class="font-mono"
                >
                  {{ host }}
                </Badge>
                <span v-if="domain.hostnames.length === 0" class="text-muted-foreground text-xs">
                  None
                </span>
              </div>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" aria-label="Actions">
                    <MoreVertical class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem @select="openEdit(domain)">Edit</DropdownMenuItem>
                  <DropdownMenuItem variant="danger" @select="askDelete(domain)">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>

    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editing ? 'Edit app' : 'New app' }}</DialogTitle>
        </DialogHeader>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <div>
            <Label for="app-name">Name</Label>
            <Input
              id="app-name"
              v-model="name"
              v-bind="nameAttrs"
              placeholder="Acme"
              :aria-invalid="!!errors.name"
            />
            <p v-if="errors.name" class="text-destructive mt-1.5 text-xs">{{ errors.name }}</p>
          </div>
          <div>
            <Label for="app-hostnames">Hostnames</Label>
            <Textarea
              id="app-hostnames"
              v-model="hostnames"
              v-bind="hostnamesAttrs"
              placeholder="acme.com&#10;shop.acme.com"
            />
            <p class="text-muted-foreground mt-1.5 text-xs">One hostname per line.</p>
          </div>
          <div>
            <Label for="app-description">Description</Label>
            <Input
              id="app-description"
              v-model="description"
              v-bind="descriptionAttrs"
              placeholder="Optional"
            />
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" @click="dialogOpen = false">Cancel</Button>
            <Button type="submit" :disabled="isSubmitting">
              {{ editing ? 'Save changes' : 'Create app' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Delete app?"
      :description="`“${deleteTarget?.name}” and its form profiles will be removed. This cannot be undone.`"
      confirm-label="Delete"
      :pending="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
