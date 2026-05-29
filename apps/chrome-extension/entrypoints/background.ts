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

  // Authenticated REST client. Its refresh hooks reference `auth` (declared just
  // below) only when a 401 actually fires — by then it is initialised — which
  // breaks the construction cycle between the client and the session manager.
  const api = createApiClient({
    baseUrl: API_BASE_URL,
    getAuthToken: () => store.getAccess(),
    refreshAuth: () => auth.refreshAuth(),
    onAuthError: () => void auth.onAuthError(),
  })
  const auth = createBackgroundAuth({ api, store })

  // The AI client shares the same session, so classify calls now carry the token.
  const ai = createAiClient({ baseUrl: API_BASE_URL, getAuthToken: () => store.getAccess() })

  onAuthRequest(auth.handlers)
  onAiClassifyRequest((summaries) => ai.classifyFields(summaries))
})
