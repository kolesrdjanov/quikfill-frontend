<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowUpCircle,
  Check,
  ChevronLeft,
  CircleHelp,
  CloudOff,
  CreditCard,
  Download,
  ExternalLink,
  Info,
  LifeBuoy,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MailCheck,
  RefreshCw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Timer,
  TimerOff,
  TriangleAlert,
  WandSparkles,
  X,
} from 'lucide-vue-next'
import { Alert, Button, Input, Label, useFormValidation } from '@quikfill/ui'
import { otpCodeInputSchema, requestMagicLinkInputSchema } from '@quikfill/schemas'
import BrandLockup from '../BrandLockup.vue'
import PanelShell from '../sidepanel/PanelShell.vue'
import MessageScreen from './MessageScreen.vue'
import OtpInput from './OtpInput.vue'
import AuthStatusBadge from './AuthStatusBadge.vue'
import { useAuthGate } from '../../lib/useAuthGate'
import { DASHBOARD_URL, WEB_STORE_URL } from '../../lib/external-urls'

// External recovery destinations. The dashboard origin is build-time (prod →
// deployed app, dev → local Vite) via lib/external-urls, so a prod build never
// deep-links to localhost.
const DASHBOARD_BILLING_URL = `${DASHBOARD_URL}/settings/billing`
const HELP_URL = `${DASHBOARD_URL}/`

const gate = useAuthGate()

// Email step — Zod + VeeValidate (root rule 1) via the shared composable.
const {
  handleSubmit: handleEmailSubmit,
  defineField,
  errors,
  setFieldValue,
} = useFormValidation(requestMagicLinkInputSchema, { email: gate.email.value })
const [email, emailAttrs] = defineField('email')

const submitEmail = handleEmailSubmit(async (values) => {
  await gate.requestCode(values.email)
})

// OTP step — the joined code, validated against the shared schema.
const otpCode = ref('')
const otpComplete = computed(() => otpCodeInputSchema.safeParse({ code: otpCode.value }).success)

function onOtpInput(value: string): void {
  otpCode.value = value
  gate.clearWrongError()
}

async function verify(): Promise<void> {
  if (otpComplete.value) await gate.verify(otpCode.value)
}

function differentEmail(): void {
  otpCode.value = ''
  gate.showSignIn()
}

async function resend(): Promise<void> {
  otpCode.value = ''
  await gate.resend()
}

// Clear the boxes whenever a fresh code is being requested.
watch(
  () => gate.screen.value,
  (screen, prev) => {
    if (screen === 'sending') otpCode.value = ''
    // Sync the field to the gate's stored email without validating — otherwise
    // the loading → email transition surfaces an "Invalid email" error on an
    // empty input the user hasn't touched yet (VeeValidate validates by default).
    if (screen === 'email' && prev !== 'email') setFieldValue('email', gate.email.value, false)
  },
)

function openTab(url: string): void {
  void browser.tabs?.create({ url })
}

function openWebStore(): void {
  openTab(WEB_STORE_URL)
}

function closePanel(): void {
  window.close()
}
</script>

<template>
  <PanelShell>
    <template #header>
      <div class="flex items-center justify-between">
        <BrandLockup />
        <div class="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            class="size-[30px]"
            aria-label="Help & privacy"
            @click="openTab(HELP_URL)"
          >
            <CircleHelp class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-[30px]"
            aria-label="Close panel"
            @click="closePanel"
          >
            <X class="size-4" />
          </Button>
        </div>
      </div>
      <div class="mt-[11px] flex items-center gap-1.5 text-[12px]">
        <AuthStatusBadge :screen="gate.screen.value" />
      </div>
    </template>

    <!-- LOADING -->
    <MessageScreen v-if="gate.screen.value === 'loading'" :icon="ScanLine" loading title="Loading">
      <template #description>Checking your session.</template>
    </MessageScreen>

    <!-- SIGN IN (email) -->
    <MessageScreen
      v-else-if="gate.screen.value === 'email'"
      :icon="WandSparkles"
      align="top"
      title="Sign in to QuikFill"
    >
      <template #description>
        QuikFill fills forms with your saved data. Sign in to start — no password, just a code by
        email.
      </template>

      <div class="mt-[18px] flex w-full flex-col gap-2.5 text-left">
        <div class="flex items-center gap-[11px] text-[12.5px]">
          <span
            class="bg-accent text-primary flex size-[30px] shrink-0 items-center justify-center rounded-[9px]"
          >
            <ScanLine class="size-[15px]" />
          </span>
          Scan any form and fill it in one click
        </div>
        <div class="flex items-center gap-[11px] text-[12.5px]">
          <span
            class="bg-accent text-primary flex size-[30px] shrink-0 items-center justify-center rounded-[9px]"
          >
            <ShieldCheck class="size-[15px]" />
          </span>
          Your values stay on your device
        </div>
      </div>

      <form class="mt-[18px] w-full text-left" novalidate @submit.prevent="submitEmail">
        <Label for="auth-email" class="mb-1.5">Email address</Label>
        <Input
          id="auth-email"
          v-model="email"
          v-bind="emailAttrs"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="you@example.com"
          :aria-invalid="!!errors.email"
        >
          <template #icon><Mail /></template>
        </Input>
        <p v-if="errors.email" class="text-destructive mt-1.5 text-xs">{{ errors.email }}</p>
      </form>
    </MessageScreen>

    <!-- SENDING -->
    <MessageScreen
      v-else-if="gate.screen.value === 'sending'"
      :icon="Mail"
      loading
      title="Sending your code"
    >
      <template #description>Emailing a 6-digit code to {{ gate.email.value }}.</template>
    </MessageScreen>

    <!-- ENTER CODE (otp) -->
    <MessageScreen
      v-else-if="gate.screen.value === 'otp'"
      :icon="MailCheck"
      align="top"
      title="Enter your code"
    >
      <template #description>
        We sent a 6-digit code to
        <strong class="text-foreground font-bold">{{ gate.email.value }}</strong
        >. It's good for 10 minutes.
      </template>

      <div class="mt-[18px] w-full">
        <OtpInput
          :model-value="otpCode"
          :error="gate.otpError.value === 'wrong' || gate.otpError.value === 'locked'"
          :disabled="gate.otpExpired.value"
          @update:model-value="onOtpInput"
          @submit="verify"
        />

        <div
          v-if="!gate.otpExpired.value"
          class="mt-3 flex items-center justify-between text-[12px]"
        >
          <span class="text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
            <Timer class="size-3.5" /> Expires in {{ gate.otpTimerLabel.value }}
          </span>
        </div>
        <div v-else class="text-muted-foreground mt-3 inline-flex items-center gap-1.5 text-[12px]">
          <TimerOff class="size-3.5" /> Code unavailable
        </div>

        <Alert v-if="gate.otpError.value === 'wrong'" variant="danger" class="mt-3.5 text-left">
          <TriangleAlert />
          <div>
            That code didn't match.
            <strong
              >{{ gate.attemptsLeft.value }} attempt{{
                gate.attemptsLeft.value === 1 ? '' : 's'
              }}
              left</strong
            >
            before it locks.
          </div>
        </Alert>
        <Alert
          v-else-if="gate.otpError.value === 'expired'"
          variant="warning"
          class="mt-3.5 text-left"
        >
          <TimerOff />
          <div>This code expired. Request a new one to keep going.</div>
        </Alert>
        <Alert
          v-else-if="gate.otpError.value === 'locked'"
          variant="danger"
          class="mt-3.5 text-left"
        >
          <TriangleAlert />
          <div>Too many tries — this code is locked. Send a fresh code to try again.</div>
        </Alert>

        <div class="mt-3.5 flex items-center justify-between">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12.5px] font-semibold"
            @click="differentEmail"
          >
            <ChevronLeft class="size-3.5" /> Different email
          </button>
          <button
            type="button"
            class="text-primary text-[12.5px] font-semibold hover:underline"
            @click="resend"
          >
            Resend code
          </button>
        </div>
      </div>
    </MessageScreen>

    <!-- VERIFYING -->
    <MessageScreen
      v-else-if="gate.screen.value === 'verifying'"
      :icon="Check"
      loading
      title="Verifying"
    >
      <template #description>Checking your code and starting a secure session.</template>
    </MessageScreen>

    <!-- SUCCESS -->
    <MessageScreen
      v-else-if="gate.screen.value === 'success'"
      :icon="Check"
      tone="success"
      title="You're in"
    >
      <template #description>
        Signed in as <strong class="text-foreground font-bold">{{ gate.email.value }}</strong
        >. QuikFill is ready on every site.
      </template>
    </MessageScreen>

    <!-- BLOCKING: error -->
    <MessageScreen
      v-else-if="gate.screen.value === 'error'"
      :icon="TriangleAlert"
      tone="danger"
      title="Something went wrong"
    >
      <template #description>
        QuikFill hit an unexpected error and stopped. Your saved data is safe — nothing on this page
        was changed.
      </template>
    </MessageScreen>

    <!-- BLOCKING: subscription -->
    <MessageScreen
      v-else-if="gate.screen.value === 'subscription'"
      :icon="CreditCard"
      tone="warning"
      title="Check your subscription"
    >
      <template #description>
        Your QuikFill plan is inactive, so filling is paused. Manage your subscription to pick up
        where you left off.
      </template>
      <Alert variant="warning" class="mt-[18px] text-left">
        <Info />
        <div>
          Saved profiles and data are kept — they'll work again the moment your plan is active.
        </div>
      </Alert>
    </MessageScreen>

    <!-- BLOCKING: offline -->
    <MessageScreen
      v-else-if="gate.screen.value === 'offline'"
      :icon="CloudOff"
      tone="gray"
      title="Can't reach QuikFill"
    >
      <template #description>
        We couldn't connect to QuikFill. Check your internet connection, then try again.
      </template>
    </MessageScreen>

    <!-- BLOCKING: session -->
    <MessageScreen
      v-else-if="gate.screen.value === 'session'"
      :icon="LogOut"
      tone="info"
      title="Your session expired"
    >
      <template #description>
        For your security you've been signed out after a period of inactivity. Sign in again to keep
        filling.
      </template>
    </MessageScreen>

    <!-- BLOCKING: ratelimit -->
    <MessageScreen
      v-else-if="gate.screen.value === 'ratelimit'"
      :icon="TriangleAlert"
      tone="warning"
      title="Too many attempts"
    >
      <template #description>
        You've requested too many codes in a short time. Hang tight for a moment, then try again.
      </template>
      <p class="text-muted-foreground mt-2 inline-flex items-center gap-1.5 text-[11.5px]">
        <Timer class="size-3" /> You can try again in {{ gate.cooldownLabel.value }}
      </p>
    </MessageScreen>

    <!-- BLOCKING: update -->
    <MessageScreen
      v-else-if="gate.screen.value === 'update'"
      :icon="ArrowUpCircle"
      tone="info"
      title="Update required"
    >
      <template #description>
        This version of QuikFill is out of date and can no longer talk to the service. Update to the
        latest version to continue.
      </template>
      <p class="text-muted-foreground mt-1 font-mono text-[11px]">
        Installed v{{ gate.installedVersion.value }}
      </p>
    </MessageScreen>

    <!-- FOOTER -->
    <template #footer>
      <template v-if="gate.screen.value === 'email'">
        <Button class="w-full" @click="submitEmail">
          <Mail class="size-4" />
          Send sign-in code
        </Button>
        <p class="text-muted-foreground flex items-center justify-center gap-1.5 text-[11.5px]">
          <ShieldCheck class="size-3" /> We never post or store your password.
        </p>
      </template>

      <Button v-else-if="gate.screen.value === 'sending'" class="w-full" disabled>
        <Loader2 class="size-4 animate-spin" />
        Sending…
      </Button>

      <template v-else-if="gate.screen.value === 'otp'">
        <Button v-if="gate.otpExpired.value" class="w-full" @click="resend">
          <RotateCw class="size-4" />
          Send a new code
        </Button>
        <Button v-else class="w-full" :disabled="!otpComplete" @click="verify">
          <Check class="size-4" />
          Verify & sign in
        </Button>
      </template>

      <Button v-else-if="gate.screen.value === 'verifying'" class="w-full" disabled>
        <Loader2 class="size-4 animate-spin" />
        Verifying…
      </Button>

      <Button v-else-if="gate.screen.value === 'success'" class="w-full" @click="gate.enterApp()">
        <ScanLine class="size-4" />
        Start filling
      </Button>

      <template v-else-if="gate.screen.value === 'error'">
        <Button class="w-full" @click="gate.showSignIn()">
          <RotateCw class="size-4" />
          Try again
        </Button>
        <Button variant="ghost" size="sm" class="w-full" @click="openTab(HELP_URL)">
          <LifeBuoy class="size-4" />
          Contact support
        </Button>
      </template>

      <template v-else-if="gate.screen.value === 'subscription'">
        <Button class="w-full" @click="openTab(DASHBOARD_BILLING_URL)">
          <ExternalLink class="size-4" />
          Manage subscription
        </Button>
        <Button variant="outline" size="sm" class="w-full" @click="gate.showSignIn()">
          <RefreshCw class="size-4" />
          I've updated it — refresh
        </Button>
      </template>

      <Button v-else-if="gate.screen.value === 'offline'" class="w-full" @click="gate.showSignIn()">
        <RotateCw class="size-4" />
        Retry
      </Button>

      <Button v-else-if="gate.screen.value === 'session'" class="w-full" @click="gate.showSignIn()">
        <LogIn class="size-4" />
        Sign in again
      </Button>

      <Button
        v-else-if="gate.screen.value === 'ratelimit'"
        class="w-full"
        :disabled="gate.cooldownActive.value"
        @click="gate.showSignIn()"
      >
        <Timer v-if="gate.cooldownActive.value" class="size-4" />
        <LogIn v-else class="size-4" />
        {{
          gate.cooldownActive.value ? `Try again in ${gate.cooldownLabel.value}` : 'Sign in again'
        }}
      </Button>

      <Button v-else-if="gate.screen.value === 'update'" class="w-full" @click="openWebStore">
        <Download class="size-4" />
        Update QuikFill
      </Button>
    </template>
  </PanelShell>
</template>
