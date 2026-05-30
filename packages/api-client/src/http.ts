import type { z } from 'zod'
import { ApiClientError } from './ai-client'

export { ApiClientError }

export type QueryValue = string | number | boolean | undefined | null

export interface RestClientConfig {
  /** API root, e.g. `/api/v1` (proxied) or `http://localhost:4010/api/v1`. */
  baseUrl: string
  /** Injectable transport — defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Returns the current access token, if any. */
  getAuthToken?: () => string | undefined | Promise<string | undefined>
  /**
   * Called once when a request gets a 401. Should refresh and resolve with the
   * new access token (or undefined on failure). Concurrent 401s share a single
   * in-flight call (queued refresh); the original requests retry once after it.
   */
  refreshAuth?: () => Promise<string | undefined>
  /** Called when authentication is unrecoverable (refresh failed / absent). */
  onAuthError?: () => void
}

export interface RequestOptions<T> {
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
  /**
   * Zod schema used to parse + validate the response body. The input type is
   * widened to `unknown` so `T` binds to the schema's *output* (post-default)
   * type, matching the resolved entity types the resource methods return.
   */
  schema?: z.ZodType<T, z.ZodTypeDef, unknown>
  /** Skip the auth header and the 401-refresh retry (for the auth endpoints). */
  skipAuth?: boolean
}

function joinUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const base = baseUrl.replace(/\/+$/, '')
  const rel = path.replace(/^\/+/, '')
  let url = `${base}/${rel}`
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  return url
}

/** Pull the human-readable message and machine `code` out of an error body. */
async function errorInfo(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const body: unknown = await response.clone().json()
    if (body && typeof body === 'object') {
      const code =
        'code' in body && typeof (body as { code: unknown }).code === 'string'
          ? (body as { code: string }).code
          : undefined
      const m = 'message' in body ? (body as { message: unknown }).message : undefined
      if (typeof m === 'string') return { message: m, code }
      if (Array.isArray(m)) return { message: m.join(', '), code }
      if (code) return { message: `Request failed (${response.status}).`, code }
    }
  } catch {
    /* fall through to the generic message */
  }
  return { message: `Request failed (${response.status}).` }
}

export interface RestClient {
  request<T>(method: string, path: string, options?: RequestOptions<T>): Promise<T>
  get<T>(path: string, options?: RequestOptions<T>): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T>
  del(path: string, options?: RequestOptions<void>): Promise<void>
}

export function createRestClient(config: RestClientConfig): RestClient {
  const transport = config.fetch ?? globalThis.fetch
  let pendingRefresh: Promise<string | undefined> | null = null

  /** Coalesce concurrent refreshes into one in-flight call. */
  function refreshOnce(): Promise<string | undefined> {
    if (!config.refreshAuth) return Promise.resolve(undefined)
    pendingRefresh ??= config.refreshAuth().finally(() => {
      pendingRefresh = null
    })
    return pendingRefresh
  }

  async function send(
    method: string,
    url: string,
    body: unknown,
    signal: AbortSignal | undefined,
    token: string | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    return transport(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  }

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions<T> = {},
  ): Promise<T> {
    const url = joinUrl(config.baseUrl, path, options.query)
    const useAuth = !options.skipAuth
    let token = useAuth ? await config.getAuthToken?.() : undefined

    let response = await send(method, url, options.body, options.signal, token)

    // Recover from an expired access token: refresh once, then retry.
    if (response.status === 401 && useAuth && config.refreshAuth) {
      const refreshed = await refreshOnce()
      if (refreshed) {
        token = refreshed
        response = await send(method, url, options.body, options.signal, token)
      }
      if (response.status === 401) {
        config.onAuthError?.()
        throw new ApiClientError('Your session has expired. Please sign in again.', 401)
      }
    }

    if (!response.ok) {
      const info = await errorInfo(response)
      throw new ApiClientError(info.message, response.status, info.code)
    }

    if (response.status === 204) return undefined as T
    const json: unknown = await response.json()
    if (!options.schema) return json as T

    const parsed = options.schema.safeParse(json)
    if (!parsed.success) {
      throw new ApiClientError(`Unexpected response shape from ${path}: ${parsed.error.message}`)
    }
    return parsed.data
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    del: (path, options) => request('DELETE', path, options),
  }
}
