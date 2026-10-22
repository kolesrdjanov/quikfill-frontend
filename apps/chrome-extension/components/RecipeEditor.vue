<script setup lang="ts">
import { ref } from 'vue'
import { Button, Input, Label, Select, Switch, useFormValidation } from '@quikfill/ui'
import { recipeSchema, type FillRecipe } from '@quikfill/schemas'
import { useRecipeStore } from '../stores/recipes'
import RecipeRuleEditor from './RecipeRuleEditor.vue'
const props = defineProps<{ recipe: FillRecipe }>()
const emit = defineEmits<{ saved: [recipe: FillRecipe]; close: [] }>()
const store = useRecipeStore()
const { defineField, handleSubmit, errors, isSubmitting } = useFormValidation(
  recipeSchema,
  props.recipe,
)
const [name, nameAttrs] = defineField('name')
const [seed, seedAttrs] = defineField('seed')
const [locale, localeAttrs] = defineField('locale')
const [onlyEmpty] = defineField('onlyEmpty')
const [rules] = defineField('rules')
const saving = ref(false),
  message = ref('')
const save = handleSubmit(async (recipe) => {
  saving.value = true
  message.value = ''
  try {
    await store.save(recipe)
    emit('saved', recipe)
  } catch {
    message.value = 'Could not save on this device. Try again.'
  } finally {
    saving.value = false
  }
})
</script>
<template>
  <form @submit="save">
    <fieldset class="space-y-3" :disabled="isSubmitting || saving">
      <p class="text-muted-foreground text-xs break-all">
        {{ recipe.origin }}{{ recipe.pathname }}
      </p>
      <div class="space-y-1">
        <Label for="recipe-name">Scenario name</Label
        ><Input
          id="recipe-name"
          v-model="name"
          v-bind="nameAttrs"
          :aria-invalid="!!errors.name"
          aria-describedby="recipe-name-error"
          class="min-h-11"
        />
        <p v-if="errors.name" id="recipe-name-error" class="text-destructive text-xs">
          {{ errors.name }}
        </p>
      </div>
      <div class="space-y-1">
        <Label for="recipe-seed">Scenario seed</Label
        ><Input
          id="recipe-seed"
          v-model="seed"
          v-bind="seedAttrs"
          :aria-invalid="!!errors.seed"
          aria-describedby="recipe-seed-error"
          class="min-h-11"
        />
        <p v-if="errors.seed" id="recipe-seed-error" class="text-destructive text-xs">
          {{ errors.seed }}
        </p>
      </div>
      <Label for="recipe-locale">Scenario locale</Label>
      <Select
        id="recipe-locale"
        v-model="locale"
        v-bind="localeAttrs"
        :aria-invalid="!!errors.locale"
        class="min-h-11"
        ><option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="sr-RS">Srpski (RS)</option></Select
      >
      <div class="flex items-center justify-between gap-3">
        <Label for="recipe-empty">Only empty fields</Label
        ><Switch id="recipe-empty" v-model="onlyEmpty" />
      </div>
      <p class="text-muted-foreground text-xs">
        Turn off to replay over existing values. Fixed values stay on this device and are included
        in exports. Unsupported boundary cases are skipped.
      </p>
      <div class="max-h-80 space-y-3 overflow-y-auto">
        <RecipeRuleEditor
          v-for="(rule, index) in rules"
          :key="rule.fieldKey"
          :rule="{ ...rule, value: rule.value ?? '', case: rule.case ?? 'valid' }"
          :index="index"
          @change="rules![index] = $event"
        />
      </div>
      <p
        v-if="Object.keys(errors).some((key) => key.startsWith('rules'))"
        role="alert"
        class="text-destructive text-xs"
      >
        Check the field rules. Each field needs a unique identity and values up to 4096 characters.
      </p>
      <p v-if="message" role="alert" class="text-destructive text-xs">{{ message }}</p>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" class="min-h-11" :disabled="saving">{{
          saving ? 'Saving…' : 'Save scenario'
        }}</Button
        ><Button
          type="button"
          variant="outline"
          class="min-h-11"
          :disabled="saving"
          @click="emit('close')"
          >Cancel</Button
        >
      </div>
    </fieldset>
  </form>
</template>
