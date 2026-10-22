import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createChromeRecipeStore,
  getActiveTab,
  requestRecipeContexts,
} from '@quikfill/browser-adapter'
import { recipeMatches } from '@quikfill/autofill-core'
import type { FillRecipe, RecipeContext } from '@quikfill/schemas'

export const useRecipeStore = defineStore('local-recipes', () => {
  const recipes = ref<FillRecipe[]>([])
  const contexts = ref<RecipeContext[]>([])
  const activeId = ref<string | null>(null)
  const repository = createChromeRecipeStore()
  async function load() {
    recipes.value = await repository.list()
  }
  async function inspect() {
    const tab = await getActiveTab()
    if (tab.id === undefined) throw new Error('Open a page with a form first.')
    contexts.value = await requestRecipeContexts(tab.id)
    if (!contexts.value.length)
      throw new Error('No available form found. Open the form and try again.')
  }
  async function selectContext(context: RecipeContext) {
    activeId.value = (await repository.active(context))?.id ?? null
  }
  async function save(recipe: FillRecipe) {
    await repository.save(recipe)
    await load()
  }
  async function activate(recipe: FillRecipe) {
    await repository.activate(recipe, recipe.id)
    activeId.value = recipe.id
  }
  async function deactivate(recipe: FillRecipe) {
    await repository.activate(recipe, null)
    activeId.value = null
  }
  async function remove(recipe: FillRecipe) {
    await repository.remove(recipe.id)
    if (activeId.value === recipe.id) activeId.value = null
    await load()
  }
  async function importFile(text: string) {
    await repository.import(text)
    await load()
  }
  function exportFile(recipe: FillRecipe) {
    return repository.export([recipe])
  }
  const matching = (context: RecipeContext) =>
    recipes.value.filter((r) => recipeMatches(r, context))
  return {
    recipes,
    contexts,
    activeId,
    load,
    inspect,
    selectContext,
    save,
    activate,
    deactivate,
    remove,
    importFile,
    exportFile,
    matching,
  }
})
