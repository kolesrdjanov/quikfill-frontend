<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '@quikfill/ui'

const router = useRouter()

onMounted(async () => {
  toast('Checkout canceled — no changes were made.')
  await router.replace('/settings/billing')
})
</script>

<template>
  <div class="text-muted-foreground py-20 text-center text-sm">Redirecting…</div>
</template>
