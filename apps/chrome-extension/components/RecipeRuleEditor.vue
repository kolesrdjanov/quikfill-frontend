<script setup lang="ts">
import { watch } from 'vue'
import { Input, Select, Label, useFormValidation } from '@quikfill/ui'
import { recipeRuleSchema, type RecipeRule } from '@quikfill/schemas'
const props = defineProps<{ rule: RecipeRule; index: number }>()
const emit = defineEmits<{ change: [rule: RecipeRule] }>()
const { defineField, errors, values } = useFormValidation(recipeRuleSchema, props.rule)
const [mode, modeAttrs] = defineField('mode')
const [value, valueAttrs] = defineField('value')
const [variant, variantAttrs] = defineField('case')
watch(
  () => ({ ...values }),
  (next) => emit('change', next as RecipeRule),
  { deep: true },
)
watch(mode, () => {
  variant.value = 'valid'
})
</script>
<template>
  <fieldset class="space-y-2 rounded-lg border p-3">
    <legend class="max-w-full px-1 text-sm font-medium break-words">{{ rule.label }}</legend>
    <Label :for="`recipe-mode-${index}`">Behavior for {{ rule.label }}</Label>
    <Select
      :id="`recipe-mode-${index}`"
      v-model="mode"
      v-bind="modeAttrs"
      :aria-invalid="!!errors.mode"
      class="min-h-11"
    >
      <option value="generated">Generate</option>
      <option value="fixed">Fixed value</option>
      <option value="skip">Skip</option>
    </Select>
    <template v-if="mode === 'fixed'">
      <Label :for="`recipe-value-${index}`">Fixed value for {{ rule.label }}</Label>
      <Input
        :id="`recipe-value-${index}`"
        v-model="value"
        v-bind="valueAttrs"
        :aria-invalid="!!errors.value"
        :aria-describedby="`recipe-value-error-${index}`"
        class="min-h-11"
      />
      <p v-if="errors.value" :id="`recipe-value-error-${index}`" class="text-destructive text-xs">
        {{ errors.value }}
      </p>
    </template>
    <template v-if="mode !== 'skip'">
      <Label :for="`recipe-case-${index}`">Test case for {{ rule.label }}</Label>
      <Select
        :id="`recipe-case-${index}`"
        v-model="variant"
        v-bind="variantAttrs"
        :aria-invalid="!!errors.case"
        class="min-h-11"
      >
        <option value="valid">Valid value</option>
        <template v-if="mode === 'generated'">
          <option value="minimum">At minimum</option>
          <option value="maximum">At maximum</option>
          <option value="belowMinimum">Below minimum (invalid)</option>
          <option value="aboveMaximum">Above maximum (invalid)</option>
          <option value="missing">Missing required value (invalid)</option>
        </template>
        <option v-else value="invalid">Expected invalid value</option>
      </Select>
    </template>
  </fieldset>
</template>
