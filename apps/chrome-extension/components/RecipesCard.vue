<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button, Input, Label, Select } from '@quikfill/ui'
import { defaultRecipeRules, recipeMatches } from '@quikfill/autofill-core'
import { recipeSchema, type FillRecipe } from '@quikfill/schemas'
import { useRecipeStore } from '../stores/recipes'
import RecipeEditor from './RecipeEditor.vue'
const store = useRecipeStore()
const editor = ref<FillRecipe | null>(null),
  selectedContext = ref('0'),
  message = ref(''),
  busy = ref(false)
const context = computed(() => store.contexts[Number(selectedContext.value)])
const matches = computed(() => (context.value ? store.matching(context.value) : []))
onMounted(() => {
  void run(() => store.load())
})
async function run(action: () => Promise<unknown>, success = '') {
  busy.value = true
  message.value = ''
  try {
    await action()
    message.value = success
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Could not complete this action.'
  } finally {
    busy.value = false
  }
}
async function inspect() {
  await store.inspect()
  selectedContext.value = '0'
  if (context.value) await store.selectContext(context.value)
}
function create() {
  const c = context.value
  if (!c) return
  const keys = defaultRecipeRules(c.fields)
  if (
    new Set(keys.map((r) => r.fieldKey)).size !== keys.length ||
    store.contexts.filter((other) => other.formKey === c.formKey).length !== 1
  ) {
    message.value =
      'This form has ambiguous identities. Give duplicate forms/fields distinct names or labels first.'
    return
  }
  const result = recipeSchema.safeParse({
    version: 1,
    engineVersion: 1,
    id: crypto.randomUUID(),
    name: 'New scenario',
    seed: crypto.randomUUID(),
    locale: 'en-US',
    onlyEmpty: true,
    origin: c.origin,
    pathname: c.pathname,
    formKey: c.formKey,
    rules: keys,
  })
  if (result.success) editor.value = result.data
  else message.value = 'This form exceeds the supported scenario limits (300 fields).'
}
function onSaved(recipe: FillRecipe) {
  editor.value = null
  message.value =
    store.activeId === recipe.id
      ? 'Saved. Active scenario updated for the next Fill.'
      : 'Saved on this device. Activate it to use with Fill.'
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  await run(async () => {
    if (file.size > 1000000) throw new Error('Scenario file exceeds 1 MB.')
    await store.importFile(await file.text())
  }, 'Imported copies. Select a matching form before activating.')
  input.value = ''
}
function exportFile(recipe: FillRecipe) {
  const url = URL.createObjectURL(
    new window.Blob([store.exportFile(recipe)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'quikfill-scenario.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <details>
    <summary class="min-h-11 cursor-pointer py-3.5 text-[13px] font-medium">QA scenarios</summary>
    <div class="space-y-3 pb-4">
      <p class="text-muted-foreground text-xs">
        Save repeatable local recipes. An active scenario runs from the Fill button beside its
        matching form.
      </p>
      <RecipeEditor
        v-if="editor"
        :key="editor.id"
        :recipe="editor"
        @close="editor = null"
        @saved="onSaved"
      />
      <template v-else>
        <Button variant="outline" class="min-h-11 w-full" :disabled="busy" @click="run(inspect)">{{
          busy ? 'Loading…' : 'Inspect forms on this page'
        }}</Button>
        <template v-if="store.contexts.length">
          <Label for="recipe-context">Target form</Label>
          <Select
            id="recipe-context"
            v-model="selectedContext"
            class="min-h-11"
            @change="context && run(() => store.selectContext(context!))"
            ><option v-for="(c, index) in store.contexts" :key="index" :value="String(index)">
              {{ c.label }} · {{ c.fields.length }} fields
            </option></Select
          >
          <Button variant="outline" class="min-h-11 w-full" :disabled="busy" @click="create"
            >Create scenario from this form</Button
          >
          <p v-if="!matches.length" class="text-muted-foreground text-xs">
            No saved scenarios match this form.
          </p>
        </template>
        <ul class="space-y-3">
          <li
            v-for="recipe in store.recipes"
            :key="recipe.id"
            class="space-y-2 rounded-lg border p-3"
          >
            <p class="text-sm font-medium break-words">
              {{ recipe.name }}
              <span v-if="store.activeId === recipe.id" class="text-success">· Active</span>
            </p>
            <p class="text-muted-foreground text-xs break-all">
              {{ recipe.origin }}{{ recipe.pathname }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="context && recipeMatches(recipe, context)"
                variant="outline"
                class="min-h-11"
                :disabled="busy"
                @click="
                  run(
                    () =>
                      store.activeId === recipe.id
                        ? store.deactivate(recipe)
                        : store.activate(recipe),
                    store.activeId === recipe.id
                      ? 'Using fresh local data.'
                      : 'Scenario active. Use Fill beside the form.',
                  )
                "
                >{{ store.activeId === recipe.id ? 'Deactivate' : 'Activate' }}</Button
              >
              <Button
                variant="outline"
                class="min-h-11"
                :disabled="busy"
                @click="editor = recipeSchema.parse(recipe)"
                >Edit</Button
              >
              <Button
                variant="outline"
                class="min-h-11"
                :disabled="busy"
                @click="exportFile(recipe)"
                >Export</Button
              >
              <Button
                variant="ghost"
                class="min-h-11"
                :disabled="busy"
                @click="run(() => store.remove(recipe), 'Scenario deleted.')"
                >Delete</Button
              >
            </div>
          </li>
        </ul>
        <div class="space-y-2">
          <Label for="recipe-import">Import scenario JSON</Label
          ><Input
            id="recipe-import"
            type="file"
            accept="application/json,.json"
            :disabled="busy"
            @change="importFile"
          />
        </div>
      </template>
      <p v-if="message" role="status" class="text-xs break-words">{{ message }}</p>
    </div>
  </details>
</template>
