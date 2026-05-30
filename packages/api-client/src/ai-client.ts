import { aiSuggestionSchema, type AiSuggestion, type FieldSummary } from '@quikfill/schemas'
import type { RestClient } from './http'

/** Context the backend may use to suggest concrete fill sources. */
export interface SuggestContext {
  entityTypes?: { id: string; name: string; fieldKeys: string[] }[]
  generatorPresetKinds?: string[]
}

export interface AiClient {
  classifyFields(fields: FieldSummary[]): Promise<AiSuggestion[]>
  suggestMappings(fields: FieldSummary[], context?: SuggestContext): Promise<AiSuggestion[]>
}

/** Error thrown for any non-2xx response or malformed body. Carries the status. */
export class ApiClientError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
  }
}

/** Keep only schema-valid suggestions; AI output is always untrusted. */
function parseSuggestions(body: unknown): AiSuggestion[] {
  if (!Array.isArray(body)) {
    throw new ApiClientError('Expected an array of AI suggestions.')
  }
  const suggestions: AiSuggestion[] = []
  for (const entry of body) {
    const parsed = aiSuggestionSchema.safeParse(entry)
    if (parsed.success) suggestions.push(parsed.data)
  }
  return suggestions
}

/**
 * AI endpoints run over the shared authenticated {@link RestClient}, so classify
 * / suggest calls carry the bearer token AND inherit its 401 → refresh → retry
 * with coalesced concurrent refresh. This sharing is required, not just tidy:
 * giving the AI client its own refresh would race the REST client against the
 * backend's single-use refresh-token rotation and could sign the user out.
 */
export function createAiClient(rest: RestClient): AiClient {
  async function post(path: string, payload: unknown): Promise<AiSuggestion[]> {
    return parseSuggestions(await rest.post<unknown>(path, payload))
  }

  return {
    classifyFields: (fields) => post('/ai/classify-fields', { fields }),
    suggestMappings: (fields, context) => post('/ai/suggest-mappings', { fields, context }),
  }
}
