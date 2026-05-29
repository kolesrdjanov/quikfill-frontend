import { createAiClient, createApiClient } from '@quikfill/api-client'
import {
  createBackgroundAuth,
  createChromeAuthStore,
  onAiClassifyRequest,
  onAuthRequest,
} from '@quikfill/browser-adapter'

// The backend owns the Gemini key and all auth; the background worker is the
// only place the api-client runs, so no token or base URL ever reaches a content
// script. Production builds must point this at their API origin and add it to
// `host_permissions` (see wxt.config.ts), exactly as today's AI base URL.
const API_BASE_URL = 'http://localhost:4010/api/v1'

export default defineBackground(() => {
  // Open the side panel (the primary UI) when the toolbar icon is clicked.
  browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})

  // Single session owner: tokens + state snapshot live in chrome.storage.local.
  const store = createChromeAuthStore()

  // The authenticated REST client. `auth` is assigned just below; the closures
  // defer reading it until a 401 actually fires, breaking the construction cycle.
  let auth: ReturnType<typeof createBackgroundAuth>
  const api = createApiClient({
    baseUrl: API_BASE_URL,
    getAuthToken: () => store.getAccess(),
    refreshAuth: () => auth.refreshAuth(),
    onAuthError: () => void auth.onAuthError(),
  })
  auth = createBackgroundAuth({ api, store })

  // The AI client shares the same session, so classify calls now carry the token.
  const ai = createAiClient({ baseUrl: API_BASE_URL, getAuthToken: () => store.getAccess() })

  onAuthRequest(auth.handlers)
  onAiClassifyRequest((summaries) => ai.classifyFields(summaries))
})
