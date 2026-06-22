<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BadgeCheck, Download, ShieldAlert, Trash2 } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  Label,
  toast,
} from '@quikfill/ui'
import { useAuthStore } from '@/stores/auth'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { profileFormSchema } from '@/schemas/forms'
import { formatDateTime } from '@/lib/format'
import { downloadJson } from '@/lib/download'

const auth = useAuthStore()
const router = useRouter()
const { handleError } = useApiError()

const { handleSubmit, defineField, isSubmitting, resetForm } = useFormValidation(profileFormSchema)
const [firstName, firstNameAttrs] = defineField('firstName')
const [lastName, lastNameAttrs] = defineField('lastName')

/** Seed the form from the currently signed-in user. */
function seed(): void {
  resetForm({
    values: {
      firstName: auth.user?.firstName ?? '',
      lastName: auth.user?.lastName ?? '',
    },
  })
}

onMounted(seed)

const verified = computed(() => !!auth.user?.emailVerifiedAt)

const onSubmit = handleSubmit(async (values) => {
  try {
    // Send the trimmed field contents verbatim — an empty string clears the name
    // on the backend (PATCH); omitting it would instead leave the old value.
    await auth.updateProfile({
      firstName: values.firstName?.trim() ?? '',
      lastName: values.lastName?.trim() ?? '',
    })
    toast.success('Profile updated')
  } catch (error) {
    handleError(error)
  }
})

const exporting = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)

/** Fetch the full account export and save it as a JSON file. */
async function onExport(): Promise<void> {
  exporting.value = true
  try {
    const data = await auth.exportData()
    downloadJson(data, `quikfill-export-${new Date().toISOString().slice(0, 10)}.json`)
    toast.success('Your data export has been downloaded')
  } catch (error) {
    handleError(error)
  } finally {
    exporting.value = false
  }
}

/** Permanently delete the account, then return to the sign-in screen. */
async function onDelete(): Promise<void> {
  deleting.value = true
  try {
    await auth.deleteAccount()
    toast.success('Your account has been deleted')
    await router.push({ name: 'sign-in' })
  } catch (error) {
    handleError(error)
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="first-name">First name</Label>
              <Input
                id="first-name"
                v-model="firstName"
                v-bind="firstNameAttrs"
                placeholder="Jane"
              />
            </div>
            <div>
              <Label for="last-name">Last name</Label>
              <Input id="last-name" v-model="lastName" v-bind="lastNameAttrs" placeholder="Doe" />
            </div>
          </div>
          <div class="flex justify-end">
            <Button type="submit" :disabled="isSubmitting">Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <dl class="divide-y text-sm">
          <div class="flex items-center justify-between gap-4 py-2.5 first:pt-0">
            <dt class="text-muted-foreground">Email</dt>
            <dd class="flex items-center gap-2 font-medium">
              <span class="truncate">{{ auth.user?.email ?? '—' }}</span>
              <Badge :variant="verified ? 'success' : 'warning'">
                <BadgeCheck v-if="verified" class="size-3.5" />
                <ShieldAlert v-else class="size-3.5" />
                {{ verified ? 'Verified' : 'Unverified' }}
              </Badge>
            </dd>
          </div>
          <div v-if="verified" class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-muted-foreground">Verified on</dt>
            <dd class="font-medium">{{ formatDateTime(auth.user?.emailVerifiedAt) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-2.5 last:pb-0">
            <dt class="text-muted-foreground">Member since</dt>
            <dd class="font-medium">{{ formatDateTime(auth.user?.createdAt) }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Data &amp; privacy</CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-0.5">
            <p class="text-sm font-medium">Export my data</p>
            <p class="text-muted-foreground text-sm">
              Download everything QuikFill holds for your account as a JSON file.
            </p>
          </div>
          <Button variant="outline" :disabled="exporting" @click="onExport">
            <Download class="size-4" />
            {{ exporting ? 'Preparing…' : 'Export' }}
          </Button>
        </div>

        <div
          class="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="space-y-0.5">
            <p class="text-sm font-medium">Delete my account</p>
            <p class="text-muted-foreground text-sm">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Button variant="destructive" :disabled="deleting" @click="deleteOpen = true">
            <Trash2 class="size-4" />
            Delete account
          </Button>
        </div>
      </CardContent>
    </Card>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete your account?"
      description="This permanently deletes your account, saved data, settings, and history, and cancels any active subscription. This cannot be undone."
      confirm-label="Delete account"
      :pending="deleting"
      @confirm="onDelete"
    />
  </div>
</template>
