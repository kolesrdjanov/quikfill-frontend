/// <reference types="chrome" />
import { recipeContextsSchema, type RecipeContext } from '@quikfill/schemas'
const RECIPE_CONTEXTS = 'RECIPE_CONTEXTS'
export async function requestRecipeContexts(tabId: number): Promise<RecipeContext[]> {
  const reply = await chrome.tabs.sendMessage(tabId, { type: RECIPE_CONTEXTS })
  return recipeContextsSchema.parse(reply)
}
export function onRecipeContexts(handler: () => RecipeContext[]): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== RECIPE_CONTEXTS) return undefined
    try {
      sendResponse(handler())
    } catch {
      sendResponse([])
    }
    return false
  })
}
