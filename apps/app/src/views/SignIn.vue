<script setup lang="ts">
import { ref } from 'vue'
import { Mail } from 'lucide-vue-next'
import { requestMagicLinkInputSchema } from '@quikfill/schemas'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@quikfill/ui'
import { useAuthStore } from '@/stores/auth'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'

const auth = useAuthStore()
const { handleError } = useApiError()

const { handleSubmit, defineField, errors, isSubmitting } = useFormValidation(
  requestMagicLinkInputSchema,
)
const [email, emailAttrs] = defineField('email')

const sent = ref(false)
const sentTo = ref('')
const devLink = ref<string | undefined>()

const onSubmit = handleSubmit(async (values) => {
  try {
    devLink.value = await auth.requestMagicLink(values.email)
    sentTo.value = values.email
    sent.value = true
  } catch (error) {
    handleError(error)
  }
})
</script>

<template>
  <Card>
    <CardHeader class="flex-col items-start gap-1 border-b-0 pb-0">
      <CardTitle class="text-2xl">Sign in to Quikfill</CardTitle>
      <CardDescription>We'll email you a magic link — no password required.</CardDescription>
    </CardHeader>
    <CardContent>
      <form v-if="!sent" class="space-y-4" novalidate @submit="onSubmit">
        <div>
          <Label for="email">Email address</Label>
          <Input
            id="email"
            v-model="email"
            v-bind="emailAttrs"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            :aria-invalid="!!errors.email"
          >
            <template #icon><Mail /></template>
          </Input>
          <p v-if="errors.email" class="text-destructive mt-1.5 text-xs">{{ errors.email }}</p>
        </div>
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          {{ isSubmitting ? 'Sending…' : 'Send magic link' }}
        </Button>
      </form>

      <div v-else class="space-y-4">
        <Alert variant="success">
          <div>
            <p class="font-semibold">Check your inbox</p>
            <p class="mt-0.5">
              We sent a sign-in link to <strong>{{ sentTo }}</strong
              >. The link expires in 15 minutes.
            </p>
          </div>
        </Alert>
        <Alert v-if="devLink" variant="info">
          <div class="min-w-0">
            <p class="font-semibold">Development link</p>
            <a :href="devLink" class="mt-0.5 block break-all underline">{{ devLink }}</a>
          </div>
        </Alert>
        <Button variant="outline" class="w-full" @click="sent = false">
          Use a different email
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
