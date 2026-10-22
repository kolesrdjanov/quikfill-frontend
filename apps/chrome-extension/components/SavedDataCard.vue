<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Button, Input, Label, Select, useFormValidation } from '@quikfill/ui'
import { savedSelectionSchema } from '@quikfill/schemas'
import { onAccountChange } from '@quikfill/browser-adapter'
import { useSavedDataStore } from '../stores/saved-data'
import { DASHBOARD_URL } from '../lib/external-urls'
const store = useSavedDataStore()
const { defineField, handleSubmit, resetForm, errors, isSubmitting } =
  useFormValidation(savedSelectionSchema)
const [ownerId] = defineField('ownerId'),
  [recordId, recordAttrs] = defineField('recordId')
const error = ref(''),
  saving = ref(false)
let unsubscribe = () => {}
onMounted(() => {
  unsubscribe = onAccountChange(store.clear)
})
onUnmounted(() => unsubscribe())
async function sample() {
  try {
    await store.sample()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not switch mode.'
  }
}
async function load() {
  await store.load()
  if (store.library)
    resetForm({ values: { ownerId: store.library.ownerId, recordId: store.active } })
}
const choose = handleSubmit(async ({ recordId }) => {
  saving.value = true
  error.value = ''
  try {
    await store.choose(recordId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not choose record.'
  } finally {
    saving.value = false
  }
})
function manage() {
  void browser.tabs.create({ url: `${DASHBOARD_URL}/data` })
}
</script>
<template>
  <details class="rounded-lg border">
    <summary class="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">Saved data</summary>
    <div class="space-y-3 border-t p-3">
      <p class="text-muted-foreground text-xs">
        Fill from one saved record. Existing values are preserved and missing values stay empty.
        Sign in to sync; cached data stays available for 24 hours on this device.
      </p>
      <Button variant="outline" class="min-h-11 w-full" :disabled="store.busy" @click="load">{{
        store.busy ? 'Syncing…' : 'Load / sync saved records'
      }}</Button>
      <form v-if="store.library?.records.length" class="space-y-2" @submit="choose">
        <Input v-model="ownerId" type="hidden" />
        <Label for="saved-record">Saved record</Label>
        <Select
          id="saved-record"
          v-model="recordId"
          v-bind="recordAttrs"
          :aria-invalid="!!errors.recordId"
          aria-describedby="saved-record-error"
          class="min-h-11"
          ><option disabled value="">Choose a record</option>
          <option v-for="record in store.library.records" :key="record.id" :value="record.id">
            {{ record.name }}
          </option></Select
        >
        <p v-if="errors.recordId" id="saved-record-error" class="text-destructive text-xs">
          Choose a saved record.
        </p>
        <Button type="submit" class="min-h-11 w-full" :disabled="saving || isSubmitting"
          >Use selected record</Button
        >
      </form>
      <Button variant="outline" class="min-h-11 w-full" @click="sample">Use sample data</Button>
      <Button variant="ghost" class="min-h-11 w-full" @click="manage">Manage saved data</Button>
      <p v-if="store.message" role="status" class="text-xs">{{ store.message }}</p>
      <p v-if="error" role="alert" class="text-destructive text-xs">{{ error }}</p>
    </div>
  </details>
</template>
