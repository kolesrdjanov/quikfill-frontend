# `apps/figma-plugin` — Scaffold Design (Full Side-Panel Parity)

> ⏸️ **ON HOLD (paused 2026-05-30).** This scaffold was designed and approved but
> never built — no `apps/figma-plugin` directory exists yet. For the authoritative
> done/missing status, see [`FIGMA_PLUGIN_STATUS.md`](../../FIGMA_PLUGIN_STATUS.md).
> This design remains the implementation reference for whoever resumes; the
> actionable phased task breakdown is in
> [`../plans/2026-05-30-figma-plugin-build.md`](../plans/2026-05-30-figma-plugin-build.md).

> **Status:** design approved (2026-05-30). Product gate treated as cleared per user
> instruction. Grounded in an 11-surface codebase audit (see commit body / workflow
> `figma-plugin-grounding`). Parent docs: [`FIGMA_PLUGIN_PLAN.md`](../../FIGMA_PLUGIN_PLAN.md),
> [`FIGMA_ADAPTER_SCOPE.md`](../../FIGMA_ADAPTER_SCOPE.md).

## 1. Goal

Scaffold a **fourth surface** — a Figma Design-mode plugin — that **composes** the
existing shared packages exactly like the chrome-extension side panel, reaching full
parity: email-OTP auth + token refresh, scan → classify (local + AI) → preview → fill
→ undo, profile save/sync, and fill-run recording. It reuses `@quikfill/figma-adapter`
(already built) for sandbox-side Figma I/O and mirrors `useFillSession` / the auth gate
1:1 in the iframe.

**Decisions locked (user):**

- **Bundler:** Vite + `vite-plugin-singlefile` (two builds).
- **Networking:** build **both** transports — `figma.fetch`-via-bridge as the
  **default/prod** path (CORS-free, zero backend change), iframe-`fetch` behind a build
  flag (`QF_NET=iframe`) for local dev/devtools debugging.
- **Scope:** **full side-panel parity** (auth + fill loop + profile sync + fill-run recording).

## 2. The two realms

| Realm                       | Has                                                        | Runs                                                                                                        |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Sandbox** (`code.ts`)     | `figma.*`, node tree, `figma.clientStorage`, `figma.fetch` | adapter bridge (scan/fill/undo/storage) + the **network executor** (`figma.fetch`)                          |
| **Iframe** (`figma.showUI`) | DOM, `window`, `fetch`                                     | Vue UI, the **ported session orchestrator + auth**, all `@quikfill/*` pure packages, api-client + ai-client |

The iframe owns all **logic/orchestration**; the sandbox owns the **Figma file + the
actual network egress** (because `figma.fetch` is the CORS-free path). Tokens never
touch the document — they live in `figma.clientStorage` (sandbox), reached over the bridge.

## 3. File tree

```
apps/figma-plugin/
  package.json                 # @quikfill/figma-plugin (private); build/typecheck/test scripts
  manifest.json                # editorType:["figma"], main, ui, networkAccess.allowedDomains
  vite.config.code.ts          # Build A: src/code.ts -> dist/code.js (IIFE)
  vite.config.ui.ts            # Build B: src/ui -> dist/ui.html (vue+tailwind+singlefile)
  tsconfig.json                # references both; project setup
  tsconfig.code.json           # lib ES2023, types ["@figma/plugin-typings"], no DOM
  tsconfig.ui.json             # lib ES2023+DOM, vue
  CLAUDE.md                    # two-realm + compose-don't-reimplement + review-first invariants
  src/
    code.ts                    # SANDBOX entry: own onmessage dispatcher (file ops -> adapter, network -> figma.fetch)
    net/
      messages.ts              # SHARED wire types: NETWORK_REQUEST/RESPONSE constant + SerializableResponse
    ui/
      index.html               # <div id="app"> + Google-Fonts <link>
      main.ts                  # createApp(App).mount('#app') + './style.css'
      style.css                # @import 'tailwindcss'; @import '@quikfill/config/theme.css'; @source
      App.vue                  # auth gate -> PanelShell (ported from sidepanel/App.vue)
      lib/
        bridge-client.ts       # iframe half: id-correlated postMessage <-> sandbox (requestScan/Fill/Undo + sendNetwork + storage)
        bridged-storage.ts     # StorageAdapter over STORAGE_REQUEST
        bridged-fetch.ts       # typeof fetch that round-trips NETWORK_REQUEST -> figma.fetch -> real Response
        net-transport.ts       # selects bridgedFetch (QF_NET=bridge) vs globalThis.fetch (QF_NET=iframe)
        api.ts                 # createApiClient(...) + createAiClient(api.rest) (iframe realm)
        auth-store.ts          # MIRROR of browser-adapter/auth-store.ts over bridged StorageAdapter
        iframe-auth.ts         # MIRROR of browser-adapter/background-auth.ts (createIframeAuth)
        sync.ts                # profile push/reconcile orchestration (reuse-or-mirror — see §6a)
        useFigmaFillSession.ts # MIRROR of lib/useFillSession.ts (the orchestrator)
        useAuthGate.ts         # MIRROR of lib/useAuthGate.ts (13-screen FSM)
        useAuth.ts             # reactive auth shell over iframe-auth
        useSettings.ts         # MIRROR of lib/useSettings.ts (bridged storage)
        useTheme.ts            # MIRROR of lib/useExtensionTheme.ts (html.dark)
        display-maps.ts        # MIRROR of lib/display-maps.ts (icon/label/tone tables)
      components/
        auth/ AuthPanel.vue OtpInput.vue AuthStatusBadge.vue MessageScreen.vue AuthOrb.vue
        sidepanel/ PanelShell.vue EmptyState.vue FieldCard.vue PlanCard.vue ResultCard.vue
                   SiteChip.vue SourcePill.vue AiSuggestionInset.vue ConfidenceMeter.vue
                   LimitationsDisclosure.vue SettingsPanel.vue
        BrandLockup.vue
```

`apps/figma-plugin` **imports** `@quikfill/figma-adapter`; the adapter package is NOT
modified (it just committed; keep it clean). Pure packages
(`@quikfill/{schemas,generators,autofill-core,ai,api-client,ui,config}`) are consumed
**in the iframe** unchanged.

## 4. The bridge (iframe ↔ sandbox)

`@quikfill/figma-adapter`'s `bridge.ts` already defines the wire envelope
(`SCAN/FILL/UNDO/STORAGE_REQUEST`, `RESPONSE`, `StorageOp`, guards) and the sandbox
registrars. The figma envelope is **id-correlated** (each message carries `id`), unlike
the extension's id-less Promise model.

**Why `code.ts` owns its own `onmessage` (does NOT call `mountSandboxBridge()`):**
`mountSandboxBridge()` hard-assigns `figma.ui.onmessage = dispatch`, and that dispatch
only knows scan/fill/undo/storage — it silently ignores a network message. We need a
**network message too**, so `code.ts` installs its own dispatcher built from the
adapter's **exported guards + functions** (`isScanRequest`, `scanFigma`, `applyFigmaFill`,
`applyFigmaUndo`, `createFigmaClientStorageAdapter`, `RESPONSE`). This keeps the adapter's
"no network" contract intact and avoids editing a package another session just touched.

```ts
// src/code.ts (sketch)
import {
  isScanRequest,
  isFillRequest,
  isUndoRequest,
  isStorageRequest,
  RESPONSE,
  scanFigma,
  applyFigmaFill,
  applyFigmaUndo,
  createFigmaClientStorageAdapter,
  type StorageOp,
} from '@quikfill/figma-adapter'
import { isNetworkRequest } from './net/messages'

const storage = createFigmaClientStorageAdapter()
const reply = (id: string, result: unknown) => figma.ui.postMessage({ type: RESPONSE, id, result })

figma.showUI(__html__, { width: 380, height: 600, themeColors: true })
figma.ui.onmessage = async (msg: unknown) => {
  if (isScanRequest(msg)) reply(msg.id, scanFigma(msg.scope, msg.options))
  else if (isFillRequest(msg)) reply(msg.id, await applyFigmaFill(msg.instructions))
  else if (isUndoRequest(msg)) reply(msg.id, await applyFigmaUndo(msg.snapshot))
  else if (isStorageRequest(msg)) reply(msg.id, await runStorageOp(storage, msg.op))
  else if (isNetworkRequest(msg)) reply(msg.id, await runFigmaFetch(msg.request))
}
```

**Iframe side — `bridge-client.ts`:** an id→Promise correlation map. Posts
`parent.postMessage({ pluginMessage: { type, id, ... } }, '*')`, listens on
`window.onmessage` for `{ pluginMessage: { type: RESPONSE, id, result } }`, resolves the
matching promise. Exposes `requestScan(scope)`, `requestFill(instructions)`,
`requestUndo(snapshot)`, `storageOp(op)`, and `sendNetwork(request)`.

## 5. Networking — both transports

### 5a. `figma.fetch`-via-bridge (default, prod)

- New **app-local** wire type (`src/net/messages.ts`): `QF_NETWORK_REQUEST` carrying a
  **serializable** request `{ url, init: { method, headers, body } }` (the `signal` is
  dropped — `AbortSignal` can't cross `postMessage`; documented limitation for v1).
- Sandbox `runFigmaFetch(request)`: `const r = await figma.fetch(url, init)` →
  return `{ status, statusText, headers: <plain obj>, body: await r.text() }`.
- Iframe `bridged-fetch.ts`: a `typeof fetch` that `sendNetwork(request)`s and
  **reconstructs a real `Response`** — `new Response(body, { status, statusText, headers })`
  (body forced to `null` for 204/205). Because it's a genuine `Response`, api-client's
  `http.ts` use of `.ok` / `.status` / `.clone().json()` / 204-handling all work unchanged.
- **CORS-free** (sandbox `figma.fetch` is not a browser fetch). Only gate:
  `manifest.networkAccess.allowedDomains` must list the API origin.

### 5b. iframe `fetch` (flag `QF_NET=iframe`, local dev)

- `net-transport.ts` selects `globalThis.fetch` when the build define `QF_NET === 'iframe'`.
- The iframe origin is `null`, so this path **requires** the local backend to include
  `null` in `CORS_ORIGINS` (a **dev-only** `.env` change, never prod). Used only when a
  dev wants network visible in the iframe's own devtools.

`api.ts` injects the selected transport: `createApiClient({ baseUrl, fetch: netTransport,
getAuthToken, refreshAuth, onAuthError })`. No api-client source change (fetch is DI'd).

## 6. Auth port (full)

Mirror, don't import, the Chrome auth pieces (they reference `chrome.*`):

- **`auth-store.ts`** — mirror of `browser-adapter/auth-store.ts`, but over the **bridged
  `StorageAdapter`** (`get/set/delete`) instead of `chrome.storage.StorageArea`. Same keys
  `auth:tokens` (`{accessToken, refreshToken}`) and `auth:state` (`AuthState`). Types
  (`AuthState`, `authTokensSchema`, `UserAccount`, `AuthStatus`) imported from
  `@quikfill/schemas` (shared contracts — fine to import).
- **`iframe-auth.ts`** — mirror of `background-auth.ts` `createBackgroundAuth` →
  `createIframeAuth({ api, store })`, same returned shape
  `{ handlers: { getState, requestCode, verify, logout }, refreshAuth, onAuthError }`.
- **Endpoints (verified):** `POST /api/v1/auth/magic-link {email}` → `{message, devCode?}`;
  `POST /auth/verify {email, code:/^\d{6}$/}` → `AuthTokensDto`;
  `POST /auth/refresh {refreshToken}` → `AuthTokensDto`; `POST /auth/logout {refreshToken}`.
  All `@Public`. api-client's `auth.*` already targets these exact paths.
- **Refresh is reactive-on-401 only** (no timer; `expiresIn` is intentionally dropped) —
  keep that behavior. In Figma the iframe **is** the long-lived realm for a plugin session,
  so http.ts's `pendingRefresh` coalescing + one-time hydration work as-is; across plugin
  re-opens, tokens are durable in `clientStorage` and refresh re-runs on the next 401.
- **Header injection** unchanged: `getAuthToken: () => store.getAccess()` (async/bridged is
  already supported), `http.ts send()` sets `Authorization: Bearer <token>`.

### 6a. Reuse-vs-mirror boundary (resolves the one ambiguity)

`@quikfill/browser-adapter` mixes **chrome-coupled** code (must NOT enter the iframe) with
**host-agnostic** orchestrators. The rule for this app:

- **Mirror (never import):** anything that touches `chrome.*` or takes a `chrome.storage.*`
  type — `createChromeStorageAdapter`, the `chrome.runtime` messaging helpers,
  `createChromeAuthStore`, and `createAuthStore(storageArea: chrome.storage.StorageArea)`.
  We re-derive `auth-store.ts` + `iframe-auth.ts` in-app over the **bridged `StorageAdapter`**
  so the iframe needs **no `@types/chrome`** (keeps it chrome-free, consistent with how
  `figma-adapter` mirrors `form-scanner`/`browser-adapter`).
- **Import if confirmed chrome-free:** `createProfileStore(adapter: StorageAdapter)` and
  `createBackgroundSync({ api, store })` take only generic deps. **Verify at build time** that
  their source files reference no `chrome.*` ambient; if clean, import and pass the bridged
  store + iframe api (no reimplementation). If either pulls a `chrome` type through the
  barrel, mirror it into `sync.ts`/`profile-store.ts` instead. Default expectation: importable.

## 7. Session orchestrator port — `useFigmaFillSession`

A near-verbatim port of `lib/useFillSession.ts` (888 lines). Only the host-coupled calls
change; the engine calls (`@quikfill/autofill-core`, `@quikfill/ai`) are identical.

| Step            | Extension call                               | Figma replacement                                                                             |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| scan            | `requestScan(tabId, {scope})`                | `bridge.requestScan(scope)` → `scanFigma` (`scope: 'selection'\|'page'`)                      |
| match           | `store.list*()`                              | bridged-storage `store.list*()` → `matchProfiles`/`matchMappings`/`indexMatchedMappings`      |
| classify (auto) | `classifyFields(fields)`                     | identical (pure, in iframe)                                                                   |
| classify (AI)   | `requestAiClassify(summaries)`               | `ai.suggestMappings(summaries, ctx)` / `ai.classifyFields` directly via api-client            |
| entity data     | `requestEntityData()`                        | `api.entityTypes.list()` + `api.entityRecords.list()` → `buildRecordIndex`/`recordValuesById` |
| preview         | `buildPreviewPlan(...)` + `applyAiOverrides` | identical                                                                                     |
| fill            | `requestFill(tabId, instructions)`           | `bridge.requestFill(instructions)` → `applyFigmaFill` (returns `{results, undoSnapshot}`)     |
| undo            | `requestUndo(tabId, snapshot)`               | `bridge.requestUndo(snapshot)` → `applyFigmaUndo`                                             |
| save            | `store.save*()` + `requestProfilePush(...)`  | bridged-storage `store.save*()` + `api.profiles.push(...)`                                    |
| sync            | `requestProfileReconcile()`                  | `api.profiles.reconcile(...)` (direct)                                                        |
| fill-run        | `requestFillRunRecord(...)`                  | `api.fillRuns.create(...)` then `api.fillRuns.update(...)` (direct)                           |

- `buildInstructions()` builds `FillInstruction[]` from each included `FillPlanItem` joined
  with its `DetectedField` (`selectorCandidates:[node.id]`, `tagName:'figma:text'`,
  `inputType:'text'`, `frame:'main'`, `shadow:false`); the adapter resolves the node by
  `selectorCandidates[0]`.
- **Scope control** reduces to **selection vs page** (`FigmaSelectionScope`); `rescanWithScope`
  maps accordingly. The extension's `'auto'|'form'|'dialog'` have no Figma analog.
- `domFingerprint` is populated by `scanFigma` (via `figmaFingerprint`); `buildPreviewPlan`
  keys saved mappings on it (`plan.ts`) — the cross-session persona moat. **Verify in tests.**

## 8. Build configs

**Build A — `vite.config.code.ts` (sandbox IIFE):**

- plugins: none. `build.lib { entry: 'src/code.ts', formats: ['iife'], name: 'qf', fileName: () => 'code.js' }`.
- `build.rollupOptions.output.inlineDynamicImports: true`, `build.target: 'es2017'`,
  `build.minify: true`, `cssCodeSplit: false`, `emptyOutDir: false`. Output `dist/code.js`.
- `define`: `import.meta.env` not used here. Ensure no Node/`process` globals leak.

**Build B — `vite.config.ui.ts` (single-file UI):**

- plugins: `vue()`, `tailwindcss()` (`@tailwindcss/vite`), `viteSingleFile()`.
- `root: 'src/ui'`, entry `src/ui/index.html`; `build.target: 'es2022'`,
  `build.cssCodeSplit: false`, `build.assetsInlineLimit: 100_000_000`, output `../../dist/ui.html`.
- `define: { 'import.meta.env.QF_NET': JSON.stringify(process.env.QF_NET ?? 'bridge') }`.
- `resolve.alias`: `@ -> src/ui`.
- `style.css`: `@import 'tailwindcss'; @import '@quikfill/config/theme.css'; @source '../../**/*.{vue,ts}'; @source '../../../../packages/ui/src';`
  (the `@quikfill/ui` `@source` is required so its classes aren't tree-shaken out of the single file).

**`manifest.json`:**

```jsonc
{
  "name": "QuikFill",
  "id": "<assigned-on-first-publish>",
  "api": "1.0.0",
  "editorType": ["figma"],
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "networkAccess": {
    "allowedDomains": ["http://localhost:4010", "https://<prod-api-domain>"],
    "reasoning": "QuikFill syncs your saved profiles and runs AI field classification through the QuikFill backend.",
  },
}
```

**`package.json` scripts:** `"build": "vite build -c vite.config.code.ts && vite build -c vite.config.ui.ts"`,
`"dev": "<watch both>"`, `"typecheck": "vue-tsc -p tsconfig.ui.json --noEmit && tsc -p tsconfig.code.json --noEmit"`,
`"test": "vitest run"`. New devDeps: `vite-plugin-singlefile`, `@figma/plugin-typings`,
`@tailwindcss/vite`, `tailwindcss`, `@vitejs/plugin-vue`, `vite`, `vue-tsc`.

## 9. Risks & decisions

| #   | Item                                       | Verdict                                                                                                                                                                                                        |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Backend CORS (null origin)**             | **Sidestepped** by the `figma.fetch` default — sandbox egress is not a browser fetch, so CORS never applies. No prod backend change. (Only `QF_NET=iframe` local dev needs a dev-only `CORS_ORIGINS += null`.) |
| 2   | `manifest.networkAccess.allowedDomains`    | Hard gate for `figma.fetch` too — must list the API origin(s). Prod domain TBD (placeholder + TODO).                                                                                                           |
| 3   | httpOnly cookie vs bearer                  | **Not an issue** — backend is Bearer-only, refresh token in body. Works null-origin.                                                                                                                           |
| 4   | `AbortSignal` across the bridge            | Dropped in the serialized network request for v1 (can't `postMessage` a signal). Acceptable; flagged.                                                                                                          |
| 5   | `@quikfill/ui` Tailwind v4 in single-file  | Known recipe (`@tailwindcss/vite` + `@source` the ui package + `viteSingleFile`). Low risk.                                                                                                                    |
| 6   | `figma.clientStorage` quota (~1 MB/plugin) | Keep auth + settings + profile **mappings** there (small); do NOT persist large `entityRecords` — fetch live each session (`ensureEntityData`).                                                                |
| 7   | Fonts in single-file iframe                | External Google-Fonts `<link>` (matches extension). Allowed in the Figma iframe; system-font fallback if blocked.                                                                                              |
| 8   | `domFingerprint` stability                 | Owned by `scanFigma`; covered by adapter tests — re-assert in the plugin's scan path.                                                                                                                          |
| 9   | Component instances / mixed fonts          | Adapter already degrades gracefully (font gate, skip-with-reason). UI surfaces skips via `ResultCard`/`LimitationsDisclosure`.                                                                                 |

## 10. Testing

- **Unit (vitest, iframe-pure):** `bridge-client` (id correlation, network round-trip),
  `bridged-fetch` (Response reconstruction incl. 204), `bridged-storage` (op mapping),
  `auth-store` (token/state round-trip over a stub adapter), `iframe-auth` (requestCode/
  verify/refresh/logout against a stub api + store), `useFigmaFillSession` (the scan→fill→undo
  sequence against a stub bridge), `buildInstructions` (FillInstruction shape).
- **Sandbox `code.ts`** stays thin; its dispatcher is covered by a small test with a stubbed
  `figma` global + `figma.fetch` (mirrors the adapter's test stub).
- **Manual (Figma desktop):** import `manifest.json` via Plugins → Development → Import; run
  against a local backend; verify auth gate, scan a form mockup, preview, fill, undo, save,
  sync. Confirm `figma.fetch` path with `networkAccess` declared.
- **Gate:** repo bar — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`.

## 11. Build sequence (phases)

1. **Project skeleton** — `package.json`, tsconfigs, both vite configs, `manifest.json`,
   `index.html`, `style.css`, empty `main.ts`/`App.vue`; get `pnpm build` to emit
   `dist/code.js` + `dist/ui.html` with a "hello" UI that loads in Figma.
2. **Bridge + transports** — `net/messages.ts`, `code.ts` dispatcher, `bridge-client.ts`,
   `bridged-storage.ts`, `bridged-fetch.ts`, `net-transport.ts`; unit-test each. Prove
   scan/fill/undo round-trip + a `figma.fetch` round-trip.
3. **Network + auth** — `api.ts`, `auth-store.ts`, `iframe-auth.ts`, `useAuth.ts`,
   `useAuthGate.ts`, auth components; the gate renders and signs in end-to-end.
4. **Session** — `useFigmaFillSession.ts` + `useSettings`/`useTheme`/`display-maps` +
   sidepanel components; the full scan→classify→preview→fill→undo loop works.
5. **Parity tail** — profile save/sync + fill-run recording wired to api-client.
6. **Polish + gate** — `CLAUDE.md`, run the full quality gate, manual Figma smoke test,
   update the status tables in `FIGMA_PLUGIN_PLAN.md`.

## 12. Open items (non-blocking; default chosen)

- Prod API domain for `networkAccess.allowedDomains` (placeholder + TODO until known).
- Figma plugin `id` (assigned on first publish; placeholder until then).
- Whether to promote any surface-local components into `@quikfill/ui` (defer; port in-app first).
