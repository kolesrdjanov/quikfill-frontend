import {
  recipeSchema,
  recipeExportSchema,
  type FillRecipe,
  type StorageAdapter,
} from '@quikfill/schemas'
import { createChromeStorageAdapter } from './storage'
const PREFIX = 'qa-recipe:'
const ACTIVE = 'qa-recipe-active:'
export const recipeContextKey = (c: Pick<FillRecipe, 'origin' | 'pathname' | 'formKey'>) =>
  JSON.stringify([c.origin, c.pathname, c.formKey])
export function createRecipeStore(repositoryAdapter: StorageAdapter) {
  const get = async (id: string): Promise<FillRecipe | null> => {
    const parsed = recipeSchema.safeParse(await repositoryAdapter.get(PREFIX + id))
    return parsed.success ? parsed.data : null
  }
  return {
    get,
    async list(): Promise<FillRecipe[]> {
      const all = await Promise.all(
        (await repositoryAdapter.list(PREFIX)).map((key) => get(key.slice(PREFIX.length))),
      )
      return all.filter((r): r is FillRecipe => r !== null)
    },
    async save(recipe: FillRecipe): Promise<void> {
      const parsed = recipeSchema.parse(recipe)
      await repositoryAdapter.set(PREFIX + parsed.id, parsed)
    },
    async remove(id: string): Promise<void> {
      await repositoryAdapter.delete(PREFIX + id)
    },
    async activate(
      context: Pick<FillRecipe, 'origin' | 'pathname' | 'formKey'>,
      id: string | null,
    ): Promise<void> {
      if (id) {
        const recipe = await get(id)
        if (!recipe || recipeContextKey(recipe) !== recipeContextKey(context))
          throw new Error('Scenario does not match this form.')
      }
      await repositoryAdapter.set(ACTIVE + recipeContextKey(context), id)
    },
    async active(
      context: Pick<FillRecipe, 'origin' | 'pathname' | 'formKey'>,
    ): Promise<FillRecipe | null> {
      const id = await repositoryAdapter.get<unknown>(ACTIVE + recipeContextKey(context))
      const recipe = typeof id === 'string' ? await get(id) : null
      return recipe && recipeContextKey(recipe) === recipeContextKey(context) ? recipe : null
    },
    export(recipes: FillRecipe[]): string {
      return JSON.stringify(
        recipeExportSchema.parse({ format: 'quikfill-recipes', version: 1, recipes }),
        null,
        2,
      )
    },
    async import(text: string): Promise<FillRecipe[]> {
      if (text.length > 1000000) throw new Error('Scenario file exceeds 1 MB.')
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new Error('Invalid JSON. Import a QuikFill scenario export.')
      }
      const result = recipeExportSchema.safeParse(raw)
      if (!result.success)
        throw new Error(
          'Unsupported or malformed scenario file. Expected QuikFill format version 1.',
        )
      const parsed = result.data
      // Imported files never overwrite or activate existing scenarios.
      const copies = parsed.recipes.map((recipe) => ({ ...recipe, id: crypto.randomUUID() }))
      for (const recipe of copies) await repositoryAdapter.set(PREFIX + recipe.id, recipe)
      return copies
    },
  }
}
export const createChromeRecipeStore = () => createRecipeStore(createChromeStorageAdapter())
