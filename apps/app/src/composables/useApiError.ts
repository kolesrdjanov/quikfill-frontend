import { ApiClientError } from '@quikfill/api-client'
import { toast } from '@quikfill/ui'

/** Centralized handling for API failures: surfaces a toast, ignores aborts. */
export function useApiError() {
  function handleError(error: unknown, fallback = 'Something went wrong. Please try again.'): void {
    // Navigations cancel in-flight requests; that is expected, not an error.
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof ApiClientError ? error.message : fallback
    toast.error(message)
  }

  return { handleError }
}
