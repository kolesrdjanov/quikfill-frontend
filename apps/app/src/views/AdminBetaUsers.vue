<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { MoreVertical, UserPlus, Users } from 'lucide-vue-next'
import { inviteBetaUserInputSchema, type BetaUser } from '@quikfill/schemas'
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  toast,
} from '@quikfill/ui'
import { useBetaUsersStore } from '@/stores/betaUsers'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { formatDateTime } from '@/lib/format'

const store = useBetaUsersStore()
const { handleError } = useApiError()

const inviteOpen = ref(false)
const confirmOpen = ref(false)
const removeTarget = ref<BetaUser | null>(null)
const removing = ref(false)

const { handleSubmit, defineField, errors, isSubmitting, resetForm } =
  useFormValidation(inviteBetaUserInputSchema)
const [email, emailAttrs] = defineField('email')

onMounted(() => void store.fetch().catch(handleError))

// Reset the field and any validation error whenever the dialog closes, so it
// reopens clean (covers Cancel, the close button, and Esc / overlay clicks).
watch(inviteOpen, (open) => {
  if (!open) resetForm({ values: { email: '' } })
})

const onInvite = handleSubmit(async (values) => {
  try {
    await store.invite(values.email)
    toast.success(`${values.email} can now access QuikFill`)
    inviteOpen.value = false
  } catch (error) {
    handleError(error)
  }
})

function askRemove(betaUser: BetaUser): void {
  removeTarget.value = betaUser
  confirmOpen.value = true
}

async function confirmRemove(): Promise<void> {
  if (!removeTarget.value) return
  removing.value = true
  try {
    await store.remove(removeTarget.value.id)
    toast.success('Beta user removed')
    confirmOpen.value = false
  } catch (error) {
    handleError(error)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-start justify-between gap-4">
      <p class="text-muted-foreground max-w-2xl text-sm">
        Invite people to the QuikFill beta. Anyone listed here can sign in; everyone else is blocked
        at sign-in. Inviting only adds them to this list — no email is sent.
      </p>

      <Dialog v-model:open="inviteOpen">
        <DialogTrigger as-child>
          <Button>
            <UserPlus class="size-4" />
            Invite beta user
          </Button>
        </DialogTrigger>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite beta user</DialogTitle>
            <DialogDescription>
              They'll be able to sign in to QuikFill right away — no email is sent.
            </DialogDescription>
          </DialogHeader>
          <form class="space-y-4" novalidate @submit="onInvite">
            <div class="space-y-1.5">
              <Label for="invite-email">Email address</Label>
              <Input
                id="invite-email"
                v-model="email"
                v-bind="emailAttrs"
                type="email"
                placeholder="newtester@example.com"
                autocomplete="off"
                :aria-invalid="!!errors.email"
              />
              <p v-if="errors.email" class="text-destructive text-xs">{{ errors.email }}</p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                :disabled="isSubmitting"
                @click="inviteOpen = false"
              >
                Cancel
              </Button>
              <Button type="submit" :disabled="isSubmitting">
                <UserPlus class="size-4" />
                {{ isSubmitting ? 'Inviting…' : 'Invite' }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    <div v-if="store.loading" class="space-y-2">
      <Skeleton v-for="n in 4" :key="n" class="h-14 w-full" />
    </div>

    <Alert v-else-if="store.items.length === 0" variant="info">
      <Users />
      <div>
        <p class="font-semibold">No beta users yet</p>
        <p>Use the “Invite beta user” button above to add the first tester.</p>
      </div>
    </Alert>

    <TableContainer v-else>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Invited by</TableHead>
            <TableHead>Added</TableHead>
            <TableHead class="w-px"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="betaUser in store.items" :key="betaUser.id">
            <TableCell class="font-medium">{{ betaUser.email }}</TableCell>
            <TableCell class="text-muted-foreground">
              {{ betaUser.invitedByEmail ?? '—' }}
            </TableCell>
            <TableCell class="text-muted-foreground">{{
              formatDateTime(betaUser.createdAt)
            }}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" aria-label="Actions">
                    <MoreVertical class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem variant="danger" @select="askRemove(betaUser)">
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Remove beta user?"
      :description="`“${removeTarget?.email}” will lose access and won't be able to sign in. This cannot be undone.`"
      confirm-label="Remove"
      :pending="removing"
      @confirm="confirmRemove"
    />
  </div>
</template>
