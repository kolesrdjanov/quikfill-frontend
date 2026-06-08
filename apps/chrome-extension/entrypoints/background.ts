import { createAiClient, createApiClient, mockAiFill } from '@quikfill/api-client'
import {
  AUTH_STATE_KEY,
  createBackgroundAuth,
  createBackgroundEntitlements,
  createBackgroundSync,
  createChromeAuthStore,
  createChromeEntitlementsStore,
  createChromeStorageAdapter,
  createProfileStore,
  chromeReinjectDeps,
  onAiClassifyRequest,
  onAiFillRequest,
  onAuthRequest,
  onEntitlementsRequest,
  onEntityDataRequest,
  onFillRunRecordRequest,
  onProfileSyncRequest,
  onSettingsSyncRequest,
  onSettingsUpdateRequest,
  reinjectContentScripts,
  writeExtensionSettings,
} from '@quikfill/browser-adapter'
import { generatorKindSchema, type AuthState, type ExtensionSettings } from '@quikfill/schemas'

/** Alarm that periodically re-pulls dashboard-managed settings while signed in. */
const SETTINGS_SYNC_ALARM = 'qf-settings-sync'
const SETTINGS_SYNC_PERIOD_MIN = 5

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
// script. The API origin is build-time config (`WXT_QF_API_BASE_URL`) shared with
// the manifest `host_permissions` (see wxt.config.ts): dev defaults to the local
// backend; a production build supplies the deployed origin (and fails the build
// if it is missing — see wxt.config.ts — so a shipped extension never targets
// localhost). The `WXT_` prefix is required so the value is also readable at
// manifest-build time, not just in this bundled source.
const API_BASE_URL = import.meta.env.WXT_QF_API_BASE_URL ?? 'http://localhost:4010/api/v1'

// Opt-in dev flag: short-circuit /ai/fill to a deterministic local stand-in so
// the in-page floating-button flow is exercisable without a Gemini key. Set
// `VITE_QF_MOCK_AI_FILL=true` for `pnpm dev:ext`; off (and tree-shaken) otherwise.
const MOCK_AI_FILL = import.meta.env.VITE_QF_MOCK_AI_FILL === 'true'

export default defineBackground(() => {
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

  // Background-owned entitlements: cached in chrome.storage.local for the panel
  // to read, refreshed via the authenticated api-client (background-only).
  const entitlements = createBackgroundEntitlements({
    api,
    store: createChromeEntitlementsStore(),
    // Only auto-warm entitlements when a session exists: the fetch is
    // authenticated, so a signed-out surface (e.g. the content overlay on every
    // page load) must not trigger it — a 401 there falsely surfaces "session
    // expired" on a fresh, never-signed-in install.
    isSignedIn: () => store.hasSession(),
  })

  // The AI client runs over the REST client's authenticated transport, so
  // classify calls carry the token AND share its 401 → refresh → retry (with a
  // single coalesced refresh — vital since refresh tokens are single-use).
  const ai = createAiClient(api.rest)

  // AI uses the richer suggest-mappings path: it feeds the model the user's saved
  // entity types + the generator kinds the client can realize, so it classifies
  // with awareness of what real data exists. Entity types rarely change in a
  // session, so cache them (lost on SW suspension, re-fetched on the next wake)
  // to keep per-field classify calls from each re-fetching. Context is best-effort
  // enrichment — a failed fetch still classifies, just without the saved-data hints.
  let entityTypesCache: Awaited<ReturnType<typeof api.entityTypes.list>> | null = null
  async function buildSuggestContext() {
    const generatorPresetKinds = [...generatorKindSchema.options]
    try {
      entityTypesCache ??= await api.entityTypes.list()
      return {
        entityTypes: entityTypesCache.map((t) => ({
          id: t.id,
          name: t.name,
          fieldKeys: t.fields.map((f) => f.key),
        })),
        generatorPresetKinds,
      }
    } catch {
      return { generatorPresetKinds }
    }
  }

  // Two-way profile sync owns the same chrome.storage.local the surfaces read,
  // and pushes/reconciles through the authenticated api-client (background-only).
  const sync = createBackgroundSync({
    api,
    store: createProfileStore(createChromeStorageAdapter()),
  })

  onAuthRequest(auth.handlers)
  onEntitlementsRequest(entitlements.handlers)
  onAiClassifyRequest(async (summaries) =>
    ai.suggestMappings(summaries, await buildSuggestContext()),
  )
  // In-page floating-button fill: the content overlay sends redacted page + field
  // metadata; the call runs over the authenticated api-client (so it carries the
  // token AND inherits 401 → refresh → retry), and the backend enforces the AI
  // entitlement + rate limit — a 402/429 surfaces back to the overlay as a mapped
  // failure cause. The dev flag swaps in a local mock so no Gemini key is needed.
  onAiFillRequest(async (request) => (MOCK_AI_FILL ? mockAiFill(request) : ai.fill(request)))
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

  // Keep the toolbar badge — and the entitlements snapshot — in sync with the
  // session. The startup state is usually signed-out, so warming entitlements only
  // on boot leaves the popup stuck on "Loading…" and the on-page buttons unable to
  // re-evaluate their AI-budget gate after sign-in without a page reload. So
  // (re)fetch entitlements the moment the user signs in, and drop the snapshot on
  // sign-out; writing the store wakes every surface (popup + overlay) via
  // storage.onChanged.
  // Pull the dashboard-managed settings into chrome.storage.local so every surface
  // (incl. the content overlay) reads the synced config. The dashboard is the
  // source of truth; this is a one-way pull, best-effort — a failed fetch leaves
  // the last-synced (or default) settings in place. Writing storage wakes every
  // open surface (popup + overlay) via storage.onChanged, so a dashboard change
  // takes effect live, with no page reload. Returns the synced settings (or null
  // on failure) so a surface-initiated sync can reflect the result immediately.
  // Triggered three ways: on sign-in (below), on a periodic alarm, and on demand
  // from the popup (open / manual "Sync settings"). Without the latter two,
  // settings only ever refreshed on a sign-in transition.
  async function hydrateSettings(): Promise<ExtensionSettings | null> {
    try {
      const me = await api.users.me()
      if (me.extensionSettings) {
        await writeExtensionSettings(me.extensionSettings)
        return me.extensionSettings
      }
    } catch {
      // Ignore — settings stay at their last-known value.
    }
    return null
  }
  // On-demand pull from a surface (popup open / manual "Sync settings" button).
  onSettingsSyncRequest(() => hydrateSettings())
  // Surface-initiated WRITE (the popup's per-site activation toggle / mode switch):
  // persist the full settings object to the account, then write the server's echo
  // to storage so the popup and the on-page overlay update live via
  // storage.onChanged. Resolves null on failure (offline / signed out), which the
  // popup surfaces without changing local state.
  onSettingsUpdateRequest(async (settings) => {
    const me = await api.users.updateSettings(settings)
    // The backend echoes the full, defaulted settings; fall back to what we sent
    // if the response omits them (keeps the type non-optional and is correct).
    const saved = me.extensionSettings ?? settings
    await writeExtensionSettings(saved)
    return saved
  })

  let lastAuthStatus: AuthState['status'] | null = null
  function onAuthState(state: AuthState): void {
    reflectBadge(state)
    if (state.status === lastAuthStatus) return
    lastAuthStatus = state.status
    if (state.status === 'signed-in') {
      void entitlements.refresh()
      void hydrateSettings()
    } else if (state.status === 'signed-out') void entitlements.clear()
  }
  void Promise.resolve(auth.handlers.getState()).then(onAuthState)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const change = changes[AUTH_STATE_KEY]
    if (change?.newValue) onAuthState(change.newValue as AuthState)
  })

  // Keep settings fresh without any user action: a periodic alarm re-pulls them
  // while a session exists. The alarm wakes the (MV3-ephemeral) worker even when
  // it is otherwise idle, so a dashboard change lands within the period instead of
  // only after the next sign-in / accidental SW recycle. The pull is authenticated,
  // so skip it when signed out (a 401 there is harmless but pointless).
  browser.alarms.create(SETTINGS_SYNC_ALARM, { periodInMinutes: SETTINGS_SYNC_PERIOD_MIN })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SETTINGS_SYNC_ALARM) return
    void store.hasSession().then((signedIn) => {
      if (signedIn) void hydrateSettings()
    })
  })

  // Heal orphaned content scripts after an install / update / reload. Chrome leaves
  // the OLD content script running in already-open tabs, so its messages to this
  // (new) worker throw and the in-page Fill button shows a misleading "Offline"
  // until the tab is reloaded. Re-inject so a freshly (re)installed extension is
  // usable on already-open tabs without a manual page reload.
  browser.runtime.onInstalled.addListener(() => void reinjectContentScripts(chromeReinjectDeps()))
})
