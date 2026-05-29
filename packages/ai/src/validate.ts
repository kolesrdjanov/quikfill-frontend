import { aiSuggestionSchema, type AiSuggestion } from '@quikfill/schemas'

/**
 * Parse raw AI output (always untrusted) into AiSuggestions. Anything that is not
 * an array, or any element that fails the schema, is dropped rather than thrown —
 * a malformed model response degrades to fewer suggestions, never an exception.
 */
export function validateAiSuggestions(raw: unknown): AiSuggestion[] {
  if (!Array.isArray(raw)) return []
  const suggestions: AiSuggestion[] = []
  for (const entry of raw) {
    const parsed = aiSuggestionSchema.safeParse(entry)
    if (parsed.success) suggestions.push(parsed.data)
  }
  return suggestions
}
