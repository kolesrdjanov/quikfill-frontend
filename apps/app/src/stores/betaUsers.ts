import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BetaUser } from '@quikfill/schemas'
import { api } from '@/lib/api'

/** Admin-only beta-access allowlist. Views call these actions; never mutate `items` directly. */
export const useBetaUsersStore = defineStore('betaUsers', () => {
  const items = ref<BetaUser[]>([])
  const loading = ref(false)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      items.value = await api.admin.listBetaUsers()
    } finally {
      loading.value = false
    }
  }

  async function invite(email: string): Promise<BetaUser> {
    const created = await api.admin.inviteBetaUser({ email })
    // The endpoint is idempotent: replace the existing row if re-invited, else prepend.
    const exists = items.value.some((item) => item.id === created.id)
    items.value = exists
      ? items.value.map((item) => (item.id === created.id ? created : item))
      : [created, ...items.value]
    return created
  }

  async function remove(id: string): Promise<void> {
    await api.admin.removeBetaUser(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetch, invite, remove }
})
