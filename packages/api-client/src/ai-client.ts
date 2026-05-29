import { aiSuggestionSchema, type AiSuggestion, type FieldSummary } from '@quikfill/schemas'

/** Context the backend may use to suggest concrete fill sources. */
export interface SuggestContext {
  entityTypes?: { id: string; name: string; fieldKeys: string[] }[]
  generatorPresetKinds?: string[]
}

export interface AiClientConfig {
  /** API root, e.g. `http://localhost:4010/api/v1` (trailing slash optional). */
  baseUrl: string
  /** Injectable transport — defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Returns the current access token, if any. */
  getAuthToken?: () => string | undefined | Promise<string | undefined>
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

function join(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
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

export function createAiClient(config: AiClientConfig): AiClient {
  const transport = config.fetch ?? globalThis.fetch

  async function post(path: string, payload: unknown): Promise<AiSuggestion[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const token = await config.getAuthToken?.()
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await transport(join(config.baseUrl, path), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new ApiClientError(`AI request failed (${response.status}).`, response.status)
    }
    return parseSuggestions(await response.json())
  }

  return {
    classifyFields: (fields) => post('/ai/classify-fields', { fields }),
    suggestMappings: (fields, context) => post('/ai/suggest-mappings', { fields, context }),
  }
}
