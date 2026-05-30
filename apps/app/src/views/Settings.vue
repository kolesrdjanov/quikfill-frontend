<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { BadgeCheck, ShieldAlert } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from '@quikfill/ui'
import { isUnlimited, usagePercent } from '@quikfill/schemas'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscription'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { profileFormSchema } from '@/schemas/forms'
import { formatDateTime } from '@/lib/format'

const auth = useAuthStore()
const subscription = useSubscriptionStore()
const { handleError } = useApiError()

const { handleSubmit, defineField, isSubmitting, resetForm } = useFormValidation(profileFormSchema)
const [firstName, firstNameAttrs] = defineField('firstName')
const [lastName, lastNameAttrs] = defineField('lastName')

const planUnlimited = computed(
  () => !!subscription.entitlements && isUnlimited(subscription.entitlements.tokenLimit),
)
const planPercent = computed(() =>
  subscription.entitlements
    ? usagePercent(subscription.entitlements.tokensUsed, subscription.entitlements.tokenLimit)
    : 0,
)

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

onMounted(async () => {
  try {
    await subscription.fetch()
  } catch (error) {
    handleError(error)
  }
})

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
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle>Subscription</CardTitle>
        <RouterLink to="/billing" class="text-primary text-sm font-medium hover:underline">
          Manage billing
        </RouterLink>
      </CardHeader>
      <CardContent>
        <div v-if="subscription.entitlements" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="font-medium">{{ subscription.entitlements.displayName }}</span>
          <Badge :variant="subscription.entitlements.status === 'active' ? 'success' : 'warning'">
            {{ subscription.entitlements.status }}
          </Badge>
          <span v-if="planUnlimited" class="text-muted-foreground">· Unlimited AI</span>
          <span v-else class="text-muted-foreground">· {{ planPercent }}% of AI used</span>
        </div>
        <p v-else class="text-muted-foreground text-sm">Loading plan…</p>
      </CardContent>
    </Card>
  </div>
</template>
