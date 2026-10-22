import { recipeFormKey } from '@quikfill/autofill-core'
import type { DetectedField, RecipeContext } from '@quikfill/schemas'
export function recipeContext(root: Element, fields: DetectedField[]): RecipeContext {
  const url = new URL(root.ownerDocument.URL)
  return {
    origin: url.origin,
    pathname: url.pathname,
    formKey: recipeFormKey(fields, root.getAttribute('id') || root.getAttribute('name') || ''),
    label:
      root.getAttribute('aria-label') ||
      root.getAttribute('name') ||
      root.id ||
      `${fields.length} fields`,
    fields: fields.map((f) => ({ ...f, currentValue: null, nearbyText: undefined })),
  }
}
