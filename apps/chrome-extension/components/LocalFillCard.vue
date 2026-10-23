<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button, Disclosure, Input, Label, Select, Switch, useFormValidation } from '@quikfill/ui'
import { DEFAULT_LOCAL_FILL_PREFERENCES, localFillPreferencesSchema } from '@quikfill/schemas'
import {
  readExtensionSettings,
  readLocalFillPreferences,
  writeLocalFillPreferences,
} from '@quikfill/browser-adapter'

const { defineField, handleSubmit, errors, resetForm } = useFormValidation(
  localFillPreferencesSchema,
  DEFAULT_LOCAL_FILL_PREFERENCES,
)
const [onlyEmpty] = defineField('onlyEmpty')
const [locale, localeAttrs] = defineField('locale')
const [seed, seedAttrs] = defineField('seed')
const loaded = ref(false)
const saving = ref(false)
const message = ref('')
onMounted(async () => {
  try {
    const [prefs, settings] = await Promise.all([
      readLocalFillPreferences(),
      readExtensionSettings(),
    ])
    resetForm({ values: { ...prefs, locale: prefs.locale ?? settings.locale } })
    loaded.value = true
  } catch {
    message.value = 'Could not read local settings. Reopen the popup and try again.'
  }
})
const save = handleSubmit(async (values) => {
  saving.value = true
  message.value = ''
  try {
    await writeLocalFillPreferences({
      ...(await readLocalFillPreferences()),
      onlyEmpty: values.onlyEmpty,
      seed: values.seed,
      locale: values.locale,
    })
    message.value = 'Saved on this device.'
  } catch {
    message.value = 'Could not save on this device. Try again.'
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <Disclosure title="Local test data">
    <form @submit="save">
      <fieldset class="space-y-4" :disabled="!loaded || saving">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label for="local-only-empty">Only empty fields</Label>
            <p class="text-muted-foreground text-xs leading-relaxed">
              Keep values you already entered.
            </p>
          </div>
          <Switch id="local-only-empty" v-model="onlyEmpty" aria-label="Only empty fields" />
        </div>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <Label for="local-locale">Sample locale</Label>
            <Select
              id="local-locale"
              v-model="locale"
              v-bind="localeAttrs"
              :aria-invalid="!!errors.locale"
              class="min-h-11"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="sr-RS">Srpski (RS)</option>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="local-seed">Repeatable seed</Label>
            <Input
              id="local-seed"
              v-model="seed"
              v-bind="seedAttrs"
              :aria-invalid="!!errors.seed"
              aria-describedby="local-seed-hint local-seed-error"
              maxlength="128"
              placeholder="Fresh data each time"
              class="min-h-11"
            />
            <p id="local-seed-hint" class="text-muted-foreground text-xs">
              The same seed repeats values for the same fields. Leave blank for fresh data.
            </p>
            <p v-if="errors.seed" id="local-seed-error" class="text-destructive text-xs">
              {{ errors.seed }}
            </p>
          </div>
          <Button
            type="submit"
            variant="outline"
            class="min-h-11 w-full"
            :disabled="!loaded || saving"
            >{{ saving ? 'Saving…' : 'Save local preferences' }}</Button
          >
        </div>
      </fieldset>
      <p v-if="message" role="status" class="text-muted-foreground mt-3 text-xs">{{ message }}</p>
    </form>
  </Disclosure>
</template>
