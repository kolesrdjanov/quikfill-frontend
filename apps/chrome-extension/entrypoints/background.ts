import { createAiClient, createApiClient } from '@quikfill/api-client'
import {
  AUTH_STATE_KEY,
  createBackgroundAuth,
  createBackgroundSync,
  createChromeAuthStore,
  createChromeStorageAdapter,
  createProfileStore,
  onAiClassifyRequest,
  onAuthRequest,
  onEntityDataRequest,
  onFillRunRecordRequest,
  onProfileSyncRequest,
} from '@quikfill/browser-adapter'
import type { AuthState } from '@quikfill/schemas'

/**
 * Reflect the session onto the toolbar icon: an amber badge when the account
 * needs attention (paused plan / expired session), red when QuikFill can't be
 * used (offline / rate-limited / error), and clear otherwise. The colour mirrors
 * the in-panel status badge so the toolbar and panel always agree.
 */
function reflectBadge(state: AuthState): void {
  const action = browser.action
  if (!action?.setBadgeText) return
  let color: string | null = null
  if (state.status === 'error') {
    color =
      state.error === 'payment-required' || state.error === 'unauthorized' ? '#fbbf24' : '#e11d48'
  }
  void action.setBadgeText({ text: color ? '!' : '' }).catch(() => {})
  if (color) void action.setBadgeBackgroundColor?.({ color }).catch(() => {})
}

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

  // The AI client runs over the REST client's authenticated transport, so
  // classify calls carry the token AND share its 401 → refresh → retry (with a
  // single coalesced refresh — vital since refresh tokens are single-use).
  const ai = createAiClient(api.rest)

  // Two-way profile sync owns the same chrome.storage.local the surfaces read,
  // and pushes/reconciles through the authenticated api-client (background-only).
  const sync = createBackgroundSync({
    api,
    store: createProfileStore(createChromeStorageAdapter()),
  })

  onAuthRequest(auth.handlers)
  onAiClassifyRequest((summaries) => ai.classifyFields(summaries))
  onProfileSyncRequest(sync.handlers)
  // Record fill-run history: create the run, then write its result. Best-effort —
  // the panel ignores failures, so an offline/expired session never blocks a fill.
  onFillRunRecordRequest(async ({ create, finish }) => {
    const run = await api.fillRuns.create(create)
    await api.fillRuns.update(run.id, finish)
  })
  // Read-only snapshot of the user's saved entity data so the panel can fill a
  // field from a saved record (recordField) instead of a synthetic generator.
  onEntityDataRequest(async () => {
    const [types, records] = await Promise.all([api.entityTypes.list(), api.entityRecords.list()])
    return { types, records }
  })

  // Keep the toolbar badge in sync with the session snapshot every surface reads.
  void Promise.resolve(auth.handlers.getState()).then(reflectBadge)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const change = changes[AUTH_STATE_KEY]
    if (change?.newValue) reflectBadge(change.newValue as AuthState)
  })
})
