<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Loader2 } from 'lucide-vue-next'
import { ApiClientError } from '@quikfill/api-client'
import { Alert, Button, Card, CardContent } from '@quikfill/ui'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const status = ref<'verifying' | 'error'>('verifying')
const message = ref('Signing you in…')

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || token.length === 0) {
    status.value = 'error'
    message.value = 'This sign-in link is missing its token. Request a new one.'
    return
  }
  try {
    await auth.verify(token)
    const redirect = route.query.redirect
    await router.replace(typeof redirect === 'string' ? redirect : { name: 'home' })
  } catch (error) {
    status.value = 'error'
    message.value =
      error instanceof ApiClientError
        ? error.message
        : 'This sign-in link is invalid or has expired.'
  }
})
</script>

<template>
  <Card>
    <CardContent class="flex flex-col items-center gap-4 py-10 text-center">
      <template v-if="status === 'verifying'">
        <Loader2 class="text-primary size-7 animate-spin" />
        <p class="text-muted-foreground text-sm">{{ message }}</p>
      </template>
      <template v-else>
        <Alert variant="danger" class="text-left">
          <div>
            <p class="font-semibold">Couldn't sign you in</p>
            <p class="mt-0.5">{{ message }}</p>
          </div>
        </Alert>
        <Button as-child variant="outline" class="w-full">
          <RouterLink to="/sign-in">Back to sign in</RouterLink>
        </Button>
      </template>
    </CardContent>
  </Card>
</template>
