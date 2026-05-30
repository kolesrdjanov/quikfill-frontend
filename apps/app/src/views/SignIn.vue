<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Mail } from 'lucide-vue-next'
import { otpCodeInputSchema, requestMagicLinkInputSchema } from '@quikfill/schemas'
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
const route = useRoute()
const router = useRouter()
const { handleError } = useApiError()

const step = ref<'email' | 'code'>('email')
const sentTo = ref('')
const devCode = ref<string | undefined>()

// Step 1 — request a code by email.
const {
  handleSubmit: handleEmailSubmit,
  defineField: defineEmailField,
  errors: emailErrors,
  isSubmitting: emailSubmitting,
} = useFormValidation(requestMagicLinkInputSchema)
const [email, emailAttrs] = defineEmailField('email')

const onRequest = handleEmailSubmit(async (values) => {
  try {
    devCode.value = await auth.requestCode(values.email)
    sentTo.value = values.email
    step.value = 'code'
  } catch (error) {
    handleError(error)
  }
})

// Step 2 — verify the emailed code.
const {
  handleSubmit: handleCodeSubmit,
  defineField: defineCodeField,
  errors: codeErrors,
  isSubmitting: codeSubmitting,
  resetForm: resetCodeForm,
} = useFormValidation(otpCodeInputSchema)
const [code, codeAttrs] = defineCodeField('code')

const onVerify = handleCodeSubmit(async (values) => {
  try {
    await auth.verify(sentTo.value, values.code)
    const redirect = route.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : { name: 'home' })
  } catch (error) {
    handleError(error)
  }
})

async function resend(): Promise<void> {
  try {
    devCode.value = await auth.requestCode(sentTo.value)
    resetCodeForm()
  } catch (error) {
    handleError(error)
  }
}

function useDifferentEmail(): void {
  step.value = 'email'
  devCode.value = undefined
  resetCodeForm()
}
</script>

<template>
  <Card>
    <CardHeader class="flex-col items-start gap-1 border-b-0 pb-0">
      <CardTitle class="text-2xl">Sign in to QuikFill</CardTitle>
      <CardDescription>
        <template v-if="step === 'email'">
          We'll email you a 6-digit sign-in code — no password required.
        </template>
        <template v-else>
          Enter the code we sent to <strong>{{ sentTo }}</strong
          >.
        </template>
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form v-if="step === 'email'" class="space-y-4" novalidate @submit="onRequest">
        <div>
          <Label for="email">Email address</Label>
          <Input
            id="email"
            v-model="email"
            v-bind="emailAttrs"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            :aria-invalid="!!emailErrors.email"
          >
            <template #icon><Mail /></template>
          </Input>
          <p v-if="emailErrors.email" class="text-destructive mt-1.5 text-xs">
            {{ emailErrors.email }}
          </p>
        </div>
        <Button type="submit" class="w-full" :disabled="emailSubmitting">
          {{ emailSubmitting ? 'Sending…' : 'Send sign-in code' }}
        </Button>
      </form>

      <form v-else class="space-y-4" novalidate @submit="onVerify">
        <Alert v-if="devCode" variant="info">
          <div class="min-w-0">
            <p class="font-semibold">Development code</p>
            <p class="mt-0.5">
              Use <strong class="font-mono tracking-widest">{{ devCode }}</strong> — emails aren't
              sent locally.
            </p>
          </div>
        </Alert>
        <div>
          <Label for="code">Sign-in code</Label>
          <Input
            id="code"
            v-model="code"
            v-bind="codeAttrs"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="123456"
            class="text-center text-lg tracking-[0.5em]"
            :aria-invalid="!!codeErrors.code"
          />
          <p v-if="codeErrors.code" class="text-destructive mt-1.5 text-xs">
            {{ codeErrors.code }}
          </p>
        </div>
        <Button type="submit" class="w-full" :disabled="codeSubmitting">
          {{ codeSubmitting ? 'Verifying…' : 'Verify & sign in' }}
        </Button>
        <div class="flex items-center justify-between text-sm">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground"
            @click="useDifferentEmail"
          >
            Use a different email
          </button>
          <button type="button" class="text-primary hover:underline" @click="resend">
            Resend code
          </button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
