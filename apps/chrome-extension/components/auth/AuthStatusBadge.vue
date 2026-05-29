<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CircleAlert, CircleCheck, CircleX, Lock, LogOut } from 'lucide-vue-next'
import { Badge, type BadgeVariants } from '@quikfill/ui'
import type { AuthGateScreen } from '../../lib/useAuthGate'

const props = defineProps<{ screen: AuthGateScreen }>()

interface BadgeDescriptor {
  variant: BadgeVariants['variant']
  icon: Component
  label: string
}

const descriptor = computed<BadgeDescriptor>(() => {
  switch (props.screen) {
    case 'app':
      return { variant: 'success', icon: CircleCheck, label: 'Signed in' }
    case 'session':
      return { variant: 'gray', icon: LogOut, label: 'Signed out' }
    case 'subscription':
      return { variant: 'warning', icon: CircleAlert, label: 'Plan paused' }
    case 'error':
    case 'offline':
    case 'ratelimit':
    case 'update':
      return { variant: 'danger', icon: CircleX, label: 'Unavailable' }
    default:
      return { variant: 'gray', icon: Lock, label: 'Not signed in' }
  }
})
</script>

<template>
  <Badge :variant="descriptor.variant">
    <component :is="descriptor.icon" />
    {{ descriptor.label }}
  </Badge>
</template>
