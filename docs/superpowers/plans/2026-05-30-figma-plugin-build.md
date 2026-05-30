# Figma Plugin — Build Task Breakdown (resume blueprint)

> **Status: ON HOLD** — paused 2026-05-30. Designed and approved but never built; no `apps/figma-plugin` directory exists yet. This is the companion to `docs/FIGMA_PLUGIN_STATUS.md` and the actionable task layer on top of the approved design spec `docs/superpowers/specs/2026-05-30-figma-plugin-design.md` (324 lines, fully read). Whoever resumes starts here.
>
> **Source-of-truth note:** `docs/FIGMA_PLUGIN_STATUS.md` declares itself the single source of truth _while paused_ ("This document supersedes the live plan docs"). Resuming this build flips the project from ON HOLD to in-progress, so `docs/FIGMA_PLUGIN_STATUS.md` MUST be un-paused/updated in lock-step (Task 6.3) or it will contradict reality.
>
> **Granularity note:** Tasks are sized ~0.5–2 days. They are deliberately NOT broken into 5-step TDD micro-steps and contain no code bodies, because several implementation decisions (Phase 0) are still open and concrete code would be guesswork. At execution time, **each task expands into bite-sized TDD steps per the `superpowers:writing-plans` skill**. All paths are relative to `apps/figma-plugin/` unless prefixed.

## Goal

Ship a **fourth surface**: a Figma **Design-mode plugin** that composes the existing shared packages exactly like the chrome-extension side panel, reaching **full side-panel parity** — email-OTP auth + reactive-on-401 token refresh, scan → classify (local + AI) → preview → fill → undo, profile save/sync, and fill-run recording. It **reuses `@quikfill/figma-adapter`** (already built, tested, committed — 31 passing) for sandbox-side Figma I/O and **mirrors `useFillSession` / the auth gate 1:1** in the iframe.

## Architecture — the two-realm model

| Realm                       | Has                                                                                            | Runs                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **SANDBOX** (`src/code.ts`) | `figma.*`, node tree, `figma.clientStorage`, `figma.fetch` — **no DOM/window/standards-fetch** | Adapter bridge (scan/fill/undo/storage) + the network executor (`figma.fetch`). Owns the Figma file + actual network egress.                |
| **IFRAME** (`figma.showUI`) | DOM, `window`, standards `fetch` — **no `figma` global**                                       | Vue UI + the ported session orchestrator + auth + all `@quikfill/*` pure packages + `api-client`/`ai-client`. Owns all logic/orchestration. |
| **SHARED**                  | wire types only                                                                                | `src/net/messages.ts`                                                                                                                       |

Tokens **never touch the document** — they live in `figma.clientStorage` (sandbox), reached over the bridge. The extension's 3-realm model (content / background / iframe) collapses to 2: content→sandbox, background's network+auth **merge into the iframe**, so the entire `chrome.runtime` messaging hop disappears and those become direct `api-client` calls.

**Locked architectural decision:** `code.ts` builds its **OWN** `figma.ui.onmessage` dispatcher (a registrar wiring the adapter's exported guards/functions — `isScanRequest`, `scanFigma`, `applyFigmaFill`, `applyFigmaUndo`, `createFigmaClientStorageAdapter`, `RESPONSE` — plus the app-local `isNetworkRequest`). It does **NOT** call `mountSandboxBridge()`: that helper hard-assigns `onmessage` to a private 4-branch dispatch that can never see a network message and cannot be extended. **The registrar+own-dispatcher path is the chosen design; `mountSandboxBridge()` / any hand-rolled-then-replaced dispatcher is the explicitly REJECTED alternative — do not regress to it** (this is locked by the spec; confirmed as a no-decision gate in Phase 0, see Task 0.10). The figma envelope is **id-correlated** (every message carries `id`), unlike the extension's id-less Promise model. The adapter is **imported, never modified** (it just committed — keep it clean).

## Tech Stack

- **Bundler:** Vite + `vite-plugin-singlefile` (two builds: sandbox IIFE → `dist/code.js`; single-file UI → `dist/ui.html`).
- **UI:** Vue 3 + Tailwind (`@tailwindcss/vite`) + the existing `@quikfill/ui` (shadcn/reka) + lucide.
- **Shared packages (consumed unchanged in iframe):** `@quikfill/{schemas,generators,autofill-core,ai,api-client,ui,config}` + `@quikfill/browser-adapter` (mirror-or-import per §6a) + `@quikfill/figma-adapter` (sandbox only).
- **Figma types:** `@figma/plugin-typings` (replaces the adapter's ambient `figma-env.d.ts` stub) — wired into the sandbox tsconfig **in Phase 1** (Task 1.1) so every Phase 2–5 sandbox typecheck runs against the real API surface, not the adapter's partial ambient stub.
- **Form/validation:** Zod + VeeValidate via `useFormValidation` (repo CLAUDE.md golden rule #1) — `vee-validate` + `@vee-validate/zod` are runtime deps (see Task 1.1).
- **Networking:** build BOTH transports — `figma.fetch`-via-bridge is default/prod (CORS-free, zero backend change); iframe-`fetch` behind build flag `QF_NET=iframe` for local dev/devtools (requires dev-only `CORS_ORIGINS += null`, never prod).
- **Quality gate:** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`.

---

## Phase 0 — Unblock (do first)

These are the gating decisions. Resolve each before the dependent phase. Each carries a spec/finding **Recommended default** so the build can proceed without escalation if no one objects. **Decisions 0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.11 are genuine open gates; 0.4 and 0.10 are documented locked constraints, not choices (see each).**

- [ ] **Task 0.1 — Product user-base GO reconciliation**
  - **Decision needed:** Confirm the paused project is being resumed and the full-parity scope still holds (the spec is approved but on hold since 2026-05-30).
  - **Options:** (a) resume full side-panel parity as specced; (b) resume with reduced scope; (c) keep paused.
  - **Recommended default:** Resume at full parity (locked by user in the spec). No scope reduction.
  - **Blocks:** Everything — this is the meta-gate for starting Phase 1.

- [ ] **Task 0.2 — Fill primitive: `node.characters =` vs `insertCharacters`**
  - **Decision needed:** How `applyFigmaFill` writes text, especially for mixed-font / styled nodes (adapter currently skips mixed-font nodes to preserve styling).
  - **Options:** (a) keep `characters =` and skip-with-reason on mixed/missing fonts (v1 adapter behavior); (b) use `insertCharacters` to preserve per-range styling.
  - **Recommended default:** Keep `characters =` + skip-with-reason for v1 (matches the shipped adapter; do not edit the adapter). Surface skips honestly in `ResultCard`/`LimitationsDisclosure`.
  - **Blocks:** Task 4.1a (`useFigmaFillSession` fill step semantics), Task 4.x result components, Phase 6 manual smoke.

- [ ] **Task 0.3 — `domFingerprint` input: name-path vs `node.id`**
  - **Decision needed:** What keys **per-field saved mappings** (the cross-surface persona moat; `buildPreviewPlan` keys on `domFingerprint`). **This is distinct from site/profile identity — see Task 0.8.**
  - **Options:** (a) name-path + layer name (breaks on frame rename); (b) `node.id` (breaks on file duplication).
  - **Recommended default:** name-path for v1 (matches form-scanner; `figmaFingerprint` already implements it this way). Document the break cases. **Verify in tests** that `scanFigma`→`buildPreviewPlan` round-trips the saved-mapping match.
  - **Blocks:** Task 4.1a (saved-mapping match keying).

- [ ] **Task 0.4 — Variant components as `select` (DOCUMENTED CONSTRAINT, not an open gate)**
  - **Constraint (not a decision):** v1 handles TEXT nodes only. The shipped, unmodifiable adapter emits `success|skipped|failed` only and **always skips non-`nativeInput` strategies**; it omits `setProperties`/the full node union. Mapping variant/instance properties to a `select` strategy would require **editing the adapter, which is forbidden** ("import-not-modify"). So there is no v1 choice to make here — variant support is out of bounds until the adapter is extended in a future iteration.
  - **Action:** Document this as a fixed limitation in `ResultCard`/`LimitationsDisclosure` copy and in `apps/figma-plugin/CLAUDE.md`. Non-`nativeInput` strategies skip-with-reason.
  - **Affects (constraint, not a block):** Task 4.1a `buildInstructions` shape (TEXT-only); Task 1.1 tsconfig `types` swap scope.

- [ ] **Task 0.5 — `clientStorage` quota / chunking strategy**
  - **Decision needed:** What persists in `figma.clientStorage` (~1MB/plugin quota) vs fetched live.
  - **Options:** (a) keep auth/settings/mappings in clientStorage, fetch `entityRecords` live each session; (b) chunk large bundles across keys.
  - **Recommended default:** Keep auth/settings/mappings in clientStorage, fetch `entityRecords` live (no chunking for v1). Note: clientStorage is structured-clone, **not** string-only — no `JSON.stringify`.
  - **Blocks:** Task 2.3 (`bridged-storage`), Task 4.x (`useSettings`, profile store mount).

- [ ] **Task 0.6 — Prod API domain + Figma plugin id**
  - **Decision needed:** The production API origin for `manifest.networkAccess.allowedDomains`, and the plugin `id`.
  - **Options:** Placeholder + TODO until known (spec §12).
  - **Recommended default:** Placeholder + TODO. Manifest lists `http://localhost:4010` + a `https://<prod-api-domain>` placeholder; `id` assigned by Figma on first publish.
  - **Blocks:** Prod use only (`figma.fetch` is hard-gated on `allowedDomains` listing the real API origin — Risk #2). Non-blocking for local dev and the whole build.

- [ ] **Task 0.7 — Reuse-vs-mirror verification for `createProfileStore` / `createBackgroundSync`**
  - **Decision needed:** Import or mirror the two sync orchestrators (per spec §6a, the one genuinely build-time-resolved ambiguity).
  - **Options:** (a) IMPORT both if their source references no `chrome.*` ambient; (b) mirror into `sync.ts`/`profile-store.ts` if either pulls a chrome type through the barrel.
  - **Recommended default:** IMPORT both (grep confirms only a doc-comment chrome mention in `profile-store`, chrome-free deps in `background-sync`). **Verify at build time** the barrel doesn't pull a chrome type through `profile-sync-messaging` value imports (it imports only chrome-free TYPES from it).
  - **Blocks:** Task 5.1 (`sync.ts` — determines import vs re-derive).

- [ ] **Task 0.8 — SITE / TAB IDENTITY: what replaces the browser tab (NEW — load-bearing gate)**
  - **Decision needed:** `useFillSession.ts` leans on `getActiveTab`/`getActiveTabId`/`hostname`/`tab.url`/`tab.title` (lines 5–6, 75, 183, 213–235, 620–691) for `matchSavedProfile`, `saveProfile`, and the `SiteChip`. **Figma has no tab.** This is a DISTINCT decision from `domFingerprint` (Task 0.3): `domFingerprint` keys per-field mappings, whereas **site identity keys profile/domain matching + the `SiteChip` label**. `saveProfile`/`matchSavedProfile` cannot be ported until this is resolved.
  - **Options:** (a) derive site identity from `figma.fileKey` + page name (stable per file/page); (b) file name + page name (human-readable, renames-on-edit); (c) a synthetic constant "figma" domain with page as sub-key.
  - **Recommended default:** Use a `fileKey`-based domain + page name for the matchable identity, with a human-readable file/page label for the `SiteChip`. Document that profile matching is per-file (or per-file+page) rather than per-hostname.
  - **Blocks:** Task 4.1b (`matchSavedProfile`/`saveProfile` port), Task 4.3 (`SiteChip` display), Task 5.1 (profile save/sync identity).

- [ ] **Task 0.9 — Undo-after-mutation UX (NEW — product decision, surface before the fill/undo loop)**
  - **Decision needed:** The shipped adapter's `applyFigmaUndo` resolves a target **only** by `selectorCandidates[0]` / `getNodeById` — it has **no `qf-id` fallback**, so undo after a node-id change (node deleted/recreated/re-parented between fill and undo) throws "Target node not found." How do we surface or guard this in the UI?
  - **Options:** (a) best-effort undo + a clear toast/`LimitationsDisclosure` note when a target node can't be re-resolved; (b) disable/grey undo once the selection/page has structurally changed; (c) snapshot the resolvable ids at fill time and warn if they no longer resolve.
  - **Recommended default:** Best-effort undo with an honest "couldn't undo N nodes (node no longer found)" surface — do **not** silently swallow. Adapter is unmodified, so we guard at the app layer.
  - **Blocks:** Task 4.1a (undo step error handling), Task 4.3 (`ResultCard`/`LimitationsDisclosure` undo messaging). (Validated by tests in Task 6.1.)

- [ ] **Task 0.10 — Dispatcher path confirmation (LOCKED — no decision, regression guard)**
  - **Status:** LOCKED by the spec. `code.ts` builds its **own** registrar-based `figma.ui.onmessage` dispatcher; it must **NOT** call `mountSandboxBridge()` or hand-roll a throwaway dispatcher. There is no choice here.
  - **Action:** Confirm at kickoff that all implementers know the registrar+own-dispatcher path is canonical and `mountSandboxBridge()` is the REJECTED alternative (it can't see a network branch and isn't extensible). Cited so no reader regresses.
  - **Affects:** Task 2.2 (own dispatcher), Task 6.2 (CLAUDE.md invariant).

- [ ] **Task 0.11 — Zod parse on the bridge boundary (NEW gate — repo "parse untrusted input" rule)**
  - **Decision needed:** Cross-realm messages crossing `postMessage` are untrusted input. The repo's non-negotiable CLAUDE.md rule is "parse untrusted input." The adapter grounded finding flags **no Zod parse on cross-realm messages**. Decide the boundary contract: add `figmaSelectionScopeSchema` + parse `instructions`/`snapshot`/`op`/network-`request` at the bridge boundary (both directions as appropriate).
  - **Options:** (a) parse every inbound cross-realm payload at the boundary (sandbox `onmessage` for scope/instructions/snapshot/op/request; iframe `onmessage` for the `RESPONSE` envelope shape); (b) parse only the sandbox-inbound op payloads; (c) trust the wire (REJECTED — violates the repo rule).
  - **Recommended default:** Parse inbound payloads at both boundary entry points with the relevant `@quikfill/schemas` schemas (add `figmaSelectionScopeSchema`). This is a **gating** contract for Tasks 2.1/2.2/2.3, not an optional aside.
  - **Blocks:** Task 2.1 (schema/guard surface), Task 2.2 (sandbox-inbound parse), Task 2.3 (iframe-inbound parse).

> **Auth port rule (spec §6a) applies throughout Phase 3/5:** MIRROR (never import) anything touching `chrome.*` / `chrome.storage.*` — `createChromeStorageAdapter`, chrome.runtime messaging helpers, `createChromeAuthStore`, `createAuthStore(storageArea)`. Re-derive `auth-store.ts` + `iframe-auth.ts` over the bridged `StorageAdapter` so the iframe needs **no `@types/chrome`**. IMPORT only confirmed chrome-free helpers (Task 0.7).

---

## Phase 1 — Project skeleton

**Goal:** `pnpm build` emits `dist/code.js` + `dist/ui.html` with a "hello" UI that loads in Figma, and the sandbox tsconfig already resolves Figma types via `@figma/plugin-typings` (not the adapter's ambient stub).

- [ ] **Task 1.1 — package + manifest + tsconfigs (with full dependency manifest)**
  - **Files:** Create: `apps/figma-plugin/package.json`, `apps/figma-plugin/manifest.json`, `apps/figma-plugin/tsconfig.json`, `apps/figma-plugin/tsconfig.code.json`, `apps/figma-plugin/tsconfig.ui.json`
  - **Port-from (reference):** `apps/chrome-extension/wxt.config.ts` (permission→networkAccess mapping), `apps/chrome-extension/package.json` (dependency block to mirror)
  - **Depends on:** Phase 0: Task 0.6 (placeholders)
  - **Does / acceptance:**
    - `package.json` (`@quikfill/figma-plugin`, private). Scripts: `build` = `vite build -c vite.config.code.ts && vite build -c vite.config.ui.ts`; `dev` = watch both; `typecheck` = `vue-tsc -p tsconfig.ui.json --noEmit && tsc -p tsconfig.code.json --noEmit`; `test` = `vitest run`.
    - **`devDependencies`:** `vite`, `vite-plugin-singlefile`, `@figma/plugin-typings`, `@tailwindcss/vite`, `tailwindcss`, `@vitejs/plugin-vue`, `vue-tsc`, `vitest`, `@vue/test-utils` (+ whatever the repo's shared vitest config needs).
    - **`dependencies` (runtime — REQUIRED for Phases 3–5 to build):** `vue`; the `@quikfill/*` workspace deps `schemas`, `ui`, `config`, `autofill-core`, `ai`, `api-client`, `generators`, `figma-adapter`, `browser-adapter` (all `workspace:*`); `lucide-vue-next`; `reka-ui`; `vee-validate`; `@vee-validate/zod`; `zod`. (Phase 1's "hello" UI may build without most of these, but Phases 3–5 will not — the manifest is specified up front so there is no mid-build surprise.)
    - `manifest.json`: `editorType:["figma"]`, `main:"dist/code.js"`, `ui:"dist/ui.html"`, `api:"1.0.0"`, `networkAccess.allowedDomains` (localhost:4010 + prod placeholder) + reasoning; `id` placeholder.
    - `tsconfig.json` references both project tsconfigs; **`tsconfig.code.json` = lib ES2023, `"types":["@figma/plugin-typings"]`, no DOM** (this is where the typings swap of Task 6.0's old placement now lands — see note below); `tsconfig.ui.json` = lib ES2023 + DOM + vue.
    - **Typings-swap is wired here, not Phase 6:** because every Phase 2–5 sandbox typecheck depends on the real Figma surface (`code.ts`/Task 2.2 needs e.g. `setProperties`, full node union), `tsconfig.code.json` points at `@figma/plugin-typings` from the start. The adapter's ambient `packages/figma-adapter/src/figma-env.d.ts` stub is **not** consumed by this app's build (and the adapter is never edited).
  - **Size:** M

- [ ] **Task 1.2 — dual Vite configs**
  - **Files:** Create: `apps/figma-plugin/vite.config.code.ts`, `apps/figma-plugin/vite.config.ui.ts`
  - **Depends on:** Task 1.1
  - **Does / acceptance:**
    - Build A (`vite.config.code.ts`): no plugins; `build.lib` entry `src/code.ts`, formats `['iife']`, name `'qf'`, `fileName`→`code.js`; `inlineDynamicImports:true`; target `es2017`; `minify:true`; `cssCodeSplit:false`; `emptyOutDir:false` → `dist/code.js`; no Node/`process` globals leak.
    - Build B (`vite.config.ui.ts`): plugins `vue()` + `tailwindcss()` + `viteSingleFile()`; `root:'src/ui'`, entry `src/ui/index.html`; target `es2022`; `cssCodeSplit:false`; `assetsInlineLimit:100_000_000` → `../../dist/ui.html`; `define` `import.meta.env.QF_NET` from `process.env.QF_NET ?? 'bridge'`; alias `@`→`src/ui`.
  - **Size:** M

- [ ] **Task 1.3 — iframe bootstrap shell ("hello" UI)**
  - **Files:** Create: `apps/figma-plugin/src/ui/index.html`, `apps/figma-plugin/src/ui/main.ts`, `apps/figma-plugin/src/ui/style.css`, `apps/figma-plugin/src/ui/App.vue` (placeholder)
  - **Depends on:** Task 1.2
  - **Does / acceptance:**
    - `index.html`: `<div id="app">` + Google-Fonts `<link>`.
    - `main.ts`: `createApp(App).mount('#app')` + `'./style.css'`.
    - `style.css`: `@import 'tailwindcss'`; `@import '@quikfill/config/theme.css'`; `@source '../../**/*.{vue,ts}'`; `@source '../../../../packages/ui/src'` (so `@quikfill/ui` classes survive the single-file tree-shake).
    - `App.vue`: trivial placeholder (replaced in Phase 3).
    - `pnpm build` emits both artifacts; manifest imports into Figma and renders the placeholder.
  - **Size:** S

> `src/code.ts` is also created here as a stub entry (so Build A succeeds), then fully built in Phase 2 / Task 2.2. The sandbox tsconfig already references `@figma/plugin-typings` (Task 1.1), so the stub and all subsequent sandbox code typecheck against the real Figma API from day one.

---

## Phase 2 — Bridge + transports

**Goal:** prove scan/fill/undo round-trip + a `figma.fetch` round-trip across the iframe↔sandbox boundary, **with Zod parsing at the boundary (Task 0.11)**. Unit-test each piece.

- [ ] **Task 2.1 — shared wire types + boundary schemas (`net/messages.ts`)**
  - **Files:** Create: `apps/figma-plugin/src/net/messages.ts`
  - **Depends on:** Phase 1; Phase 0: Task 0.11
  - **Does / acceptance:**
    - Exports `NETWORK_REQUEST`/`RESPONSE` constants + `SerializableResponse {status,statusText,headers,body}`.
    - `QF_NETWORK_REQUEST` carries `{url, init:{method,headers,body}}` — **signal dropped** (AbortSignal can't cross postMessage; documented v1 limitation).
    - Exports `isNetworkRequest` guard **and the boundary Zod schemas** (`figmaSelectionScopeSchema` + parse helpers for `instructions`/`snapshot`/`op`/network-`request` and the `RESPONSE` envelope) per Task 0.11 — these are consumed by 2.2 (sandbox-inbound) and 2.3 (iframe-inbound), **not optional**.
  - **Size:** S

- [ ] **Task 2.2 — sandbox dispatcher (`code.ts`)**
  - **Files:** Create: `apps/figma-plugin/src/code.ts` (replaces the Phase 1 stub)
  - **Port-from (reference):** `apps/chrome-extension/entrypoints/content.ts`, `apps/chrome-extension/entrypoints/background.ts` (network executor pattern only)
  - **Depends on:** Task 2.1; Phase 0: Task 0.2, Task 0.10, Task 0.11
  - **Does / acceptance:**
    - Builds its **own** `figma.ui.onmessage` dispatcher (registrar) from adapter guards (`isScanRequest`/`isFillRequest`/`isUndoRequest`/`isStorageRequest`) routing to `scanFigma`/`applyFigmaFill`/`applyFigmaUndo`/`createFigmaClientStorageAdapter`. **Does NOT call `mountSandboxBridge()`** (Task 0.10 — the rejected alternative).
    - **Zod-parses inbound payloads** (scope/instructions/snapshot/op/request) at the dispatcher entry per Task 0.11 before handing to adapter functions.
    - Adds a network branch (`isNetworkRequest`) → `runFigmaFetch(request)` = `figma.fetch(url,init)` → `{status,statusText,headers:plainObj,body:await r.text()}`.
    - Replies via `figma.ui.postMessage({type:RESPONSE,id,result})` (id-correlated).
    - `figma.showUI(__html__,{width:380,height:600,themeColors:true})`. (See Task 4.2 for which theme path is authoritative.)
    - Thin dispatcher test with stubbed `figma` global + `figma.fetch` (mirrors adapter test stub); covers the Zod-parse reject path.
  - **Size:** M

- [ ] **Task 2.3 — iframe bridge client + bridged storage**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/bridge-client.ts`, `apps/figma-plugin/src/ui/lib/bridged-storage.ts`
  - **Port-from (reference):** `packages/browser-adapter/src/messaging.ts`, `packages/browser-adapter/src/storage.ts`
  - **Depends on:** Task 2.1; Phase 0: Task 0.5, Task 0.11
  - **Does / acceptance:**
    - `bridge-client.ts`: id→Promise correlation map; `parent.postMessage({pluginMessage:{type,id,...}},'*')`; listens `window.onmessage` for `{pluginMessage:{type:RESPONSE,id,result}}`. **Zod-parses the inbound `RESPONSE` envelope** (Task 0.11). Exposes `requestScan(scope)`, `requestFill(instructions)`, `requestUndo(snapshot)`, `storageOp(op)`, `sendNetwork(request)`.
    - `bridged-storage.ts`: a `StorageAdapter` (`get`/`set`/`delete`/`list`) forwarding over `storageOp` to the sandbox `createFigmaClientStorageAdapter` (no `JSON.stringify` — structured clone).
    - Unit tests: id correlation, op mapping, envelope-parse reject; `get` returns `null` for absent keys.
  - **Size:** M

- [ ] **Task 2.4 — bridged fetch + transport selector**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/bridged-fetch.ts`, `apps/figma-plugin/src/ui/lib/net-transport.ts`
  - **Port-from (reference, for DI shape):** `packages/api-client/src/http.ts` (line 83 `config.fetch ?? globalThis.fetch`)
  - **Depends on:** Task 2.3; Phase 0: Task 0.6
  - **Does / acceptance:**
    - `bridged-fetch.ts`: a `typeof fetch` that `sendNetwork()`s and reconstructs a **real** `Response` via `new Response(body,{status,statusText,headers})`, body forced `null` for 204/205 — so `api-client` `http.ts` (`.ok`/`.status`/`.clone().json()`/204) works unchanged.
    - `net-transport.ts`: selects `bridgedFetch` (`QF_NET=bridge`, default) vs `globalThis.fetch` (`QF_NET=iframe`) via the build define.
    - Unit tests: Response reconstruction incl. 204; transport selection by flag.
    - **End-to-end acceptance:** stubbed scan/fill/undo round-trip + a `figma.fetch` round-trip both pass.
  - **Size:** M

---

## Phase 3 — Network + auth

**Goal:** the auth gate renders and signs in end-to-end (magic-link → OTP → verify → app).

> **Circular-dependency break (api.ts ↔ iframe-auth.ts):** `api.ts` needs `refreshAuth`/`onAuthError` hooks that live in `iframe-auth.ts`, but `iframe-auth.ts` calls the api it's wired into. **Encoded ordering: build `api.ts` first as a skeleton that takes `refreshAuth`/`onAuthError` as injected (DI) parameters (no value-import of `iframe-auth`); then build `iframe-auth.ts`; then a thin wire step composes them.** This is why Task 3.1 depends on 2.4 only (NOT on 3.3), and the loop is closed in the explicit Task 3.3b wire step — no `dependsOn` cycle.

- [ ] **Task 3.1 — iframe api wiring skeleton (`api.ts`)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/api.ts`
  - **Port-from (reference):** `apps/chrome-extension/entrypoints/background.ts` (`buildSuggestContext` = entityTypes cache + `[...generatorKindSchema.options]`)
  - **Depends on:** Task 2.4 (**not** Task 3.3 — `refreshAuth`/`onAuthError` are injected params, breaking the loop)
  - **Does / acceptance:**
    - `createApiClient({baseUrl, fetch:netTransport, getAuthToken, refreshAuth, onAuthError})` + `createAiClient(api.rest)` — **`refreshAuth`/`onAuthError`/`getAuthToken` are constructor params (DI), so this file has no value-import of `iframe-auth.ts`.** **No api-client source change** — fetch is DI'd.
    - Endpoints verified (all `@Public`): `POST /api/v1/auth/magic-link {email}`→`{message,devCode?}`; `POST /auth/verify {email,code:/^\d{6}$/}`→`AuthTokensDto`; `POST /auth/refresh {refreshToken}`→`AuthTokensDto`; `POST /auth/logout {refreshToken}`.
    - `baseUrl` from manifest `allowedDomains` + build constant (replaces `API_BASE_URL`); `reflectBadge` has no Figma analog — dropped.
  - **Size:** M

- [ ] **Task 3.2 — auth store (mirror over bridged storage)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/auth-store.ts`
  - **Port-from (MIRROR):** `packages/browser-adapter/src/auth-store.ts`
  - **Depends on:** Task 2.3; Phase 0: Task 0.7 (auth rule)
  - **Does / acceptance:**
    - Same keys `auth:tokens` / `auth:state` (`AUTH_STATE_KEY`); same `getAccess/getRefresh/hasSession/setTokens/clearTokens/readState/writeState` surface.
    - Signature drops `chrome.storage.StorageArea` → takes the bridged `StorageAdapter`; remove `/// <reference types=chrome />` so the iframe needs no `@types/chrome`.
    - Types (`AuthState`, `authTokensSchema`, `UserAccount`, `AuthStatus`) imported from `@quikfill/schemas`.
    - Unit test: token/state round-trip over a stub adapter.
  - **Size:** M

- [ ] **Task 3.3 — iframe auth (session owner, mirror)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/iframe-auth.ts`
  - **Port-from (MIRROR):** `packages/browser-adapter/src/background-auth.ts`
  - **Depends on:** Task 3.2 (consumes an api instance via param — see 3.3b for the wire)
  - **Does / acceptance:**
    - `createIframeAuth({api,store})` → `{handlers:{getState,requestCode,verify,logout}, refreshAuth, onAuthError}` (same shape as background-auth). **`api` is a constructor param** (the skeleton from 3.1).
    - hydrate-once (coalesced `users.me()`) + **reactive-on-401 refresh only** (no expiry timer; `expiresIn` dropped) — survives iframe unmount; durable clientStorage tokens; refresh re-runs on next 401 after re-open.
    - Unit test: `requestCode`/`verify`/`refresh`/`logout` against stub api+store.
  - **Size:** M

- [ ] **Task 3.3b — close the api ↔ auth loop (wire step)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/auth-api.ts` (the single composition module that constructs `store` → `iframe-auth` → injects its `refreshAuth`/`onAuthError`/`getAuthToken` back into `createApiClient`, then re-binds the api into `iframe-auth`)
  - **Port-from (reference):** `apps/chrome-extension/entrypoints/background.ts` (the equivalent wiring of auth + api)
  - **Depends on:** Task 3.1, Task 3.3
  - **Does / acceptance:**
    - Resolves the chicken-and-egg with a deferred/late-bound api ref (or a two-phase construct: api skeleton with a settable auth callback, then `iframe-auth` constructed against it, then callbacks set). The result is one exported `{ api, ai, auth }` the UI consumes.
    - Unit test: a 401 from a stubbed transport triggers `refreshAuth` exactly once and retries.
  - **Size:** S

- [ ] **Task 3.4 — reactive auth shell + gate FSM**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/useAuth.ts`, `apps/figma-plugin/src/ui/lib/useAuthGate.ts`
  - **Port-from (MIRROR):** `apps/chrome-extension/lib/useAuth.ts`, `apps/chrome-extension/lib/useAuthGate.ts`
  - **Depends on:** Task 3.3b
  - **Does / acceptance:**
    - `useAuth.ts`: reactive shell (`state`/`isAuthenticated`/`user`/`error`); replace `requestAuthState/requestAuthCode/verifyAuthCode/logoutAuth` chrome.runtime calls with direct `auth.handlers.*` calls; **drop `storage.onChanged` cross-surface sync** (single iframe).
    - `useAuthGate.ts`: 13-screen FSM (loading/email/sending/otp/verifying/success/app + error/subscription/offline/session/ratelimit/update); client OTP attempt counter (max 5), 10-min TTL, 60s cooldown; `blockingScreenFor`/`screenFromAuth`. **Adapt `currentVersion()`** — replace `browser.runtime.getManifest().version` with the Figma manifest version / build-define.
  - **Size:** L

- [ ] **Task 3.5 — BrandLockup + supporting auth presentational components**
  - **Files:** Create: `apps/figma-plugin/src/ui/components/BrandLockup.vue`, `apps/figma-plugin/src/ui/components/auth/OtpInput.vue`, `apps/figma-plugin/src/ui/components/auth/AuthStatusBadge.vue`, `apps/figma-plugin/src/ui/components/auth/MessageScreen.vue`, `apps/figma-plugin/src/ui/components/auth/AuthOrb.vue`
  - **Port-from:** `apps/chrome-extension/components/BrandLockup.vue`, `apps/chrome-extension/components/auth/{OtpInput,AuthStatusBadge,MessageScreen,AuthOrb}.vue`
  - **Depends on:** Task 3.4 (for prop/event contracts); BrandLockup has no auth dep and may land as early as Phase 1.
  - **Does / acceptance:**
    - Near-verbatim presentational ports (shadcn/`@quikfill/ui` + lucide). `OtpInput`: 6 segmented boxes, paste/keyboard nav, shake-on-error. `BrandLockup` is shared with the panel shell (Task 4.3) — porting it here lands it once.
  - **Size:** M

- [ ] **Task 3.6 — AuthPanel (the heavy auth task — 13 screens + email form + external-action adaptations)**
  - **Files:** Create: `apps/figma-plugin/src/ui/components/auth/AuthPanel.vue`
  - **Port-from:** `apps/chrome-extension/components/auth/AuthPanel.vue`
  - **Depends on:** Task 3.4, Task 3.5
  - **Does / acceptance:**
    - Render all **13 screens** + the email form (**Zod + VeeValidate via `useFormValidation`** — golden rule #1; deps wired in Task 1.1) + the OTP step (delegates to `OtpInput`).
    - **Adapt external actions:** `browser.tabs?.create({url})` → `window.open(url)`; drop the Web Store update path (Figma updates via Community); `window.close()` → a bridge close message; `installedVersion` from the Figma manifest.
    - Unit test: email-form validation + screen transitions against a stub gate.
  - **Size:** L

- [ ] **Task 3.7 — root App: auth gate wiring**
  - **Files:** Modify: `apps/figma-plugin/src/ui/App.vue`
  - **Port-from:** `apps/chrome-extension/entrypoints/sidepanel/App.vue` + `main.ts` (gate switch only)
  - **Depends on:** Task 3.4, Task 3.6, (PanelShell from Phase 4 — render a stub until then)
  - **Does / acceptance:**
    - Root renders `AuthPanel` when `!isAppReady`, else `PanelShell` (stub for now).
    - **Acceptance:** the gate renders and signs in end-to-end against the local backend.
  - **Size:** M

---

## Phase 4 — Session

**Goal:** the full scan → classify → preview → fill → undo loop works.

> **Sizing note:** the `useFillSession.ts` port is ~888 lines and is split into **4.1a (core loop)** and **4.1b (match/save/site-identity + AI-error envelope + entity data)** so the largest risk in the plan is not hidden behind one "L". **4.1a owns the scan→classify→preview→fill→undo core; 4.1b adds the match/save/site-identity/entity-data tails.** The profile-**save/sync** and fill-**run-recording** tails are _not_ in 4.1 at all — they are deferred to Phase 5 (Tasks 5.1/5.2) and 4.1 explicitly excludes them, so there is no overlap with 5.2 re-opening the file.

- [ ] **Task 4.1a — `useFigmaFillSession` core (scan → classify → preview → fill → undo)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/useFigmaFillSession.ts`
  - **Port-from (MIRROR, core slice of ~888 lines):** `apps/chrome-extension/lib/useFillSession.ts`
  - **Depends on:** Task 2.3, Task 2.4, Task 3.3b; Phase 0: Task 0.2, Task 0.3, Task 0.4 (constraint), Task 0.9 (undo UX)
  - **Does / acceptance:**
    - Engine calls IDENTICAL and run in-iframe (`@quikfill/autofill-core`: `buildPreviewPlan`/`buildFillPlan`/`classifyFields`/`matchMappings`/`indexMatchedMappings`/`buildRecordIndex`/`recordValuesById`/`recordMatchForSemanticType`; `@quikfill/ai`: `buildFieldSummaries`/`suggestionToProposal`).
    - Host-coupled step substitutions for the core loop: scan→`bridge.requestScan(scope)`→`scanFigma`; classify(local)→`classifyFields`; classify(AI)→`ai.suggestMappings(summaries,ctx)` direct; preview→`buildPreviewPlan`; fill→`bridge.requestFill(instructions)`→`{results,undoSnapshot}`; undo→`bridge.requestUndo(snapshot)` **with the Task 0.9 best-effort/guard handling**.
    - `buildInstructions()` builds `FillInstruction[]` (`selectorCandidates:[node.id]`, `tagName:'figma:text'`, `inputType:'text'`, `frame:'main'`, `shadow:false`). Scope = `FigmaSelectionScope` (`selection`|`page`) — `auto/form/dialog` dropped. **TEXT-only per the Task 0.4 constraint.** `getActiveTab*` removed (no site identity needed for the core loop; identity lands in 4.1b).
    - Per-field **source-pill cycling** + **on-demand single-field AI classify** + **hide-values toggle** belong to this core (they operate on the scanned/previewed plan).
    - Unit test: scan→fill→undo against a stub bridge; `buildInstructions` shape; `domFingerprint` saved-mapping match (Task 0.3); undo-after-mutation surfaces honestly (Task 0.9).
  - **Size:** L

- [ ] **Task 4.1b — `useFigmaFillSession` match/save + site identity + entity data + AI-error envelope**
  - **Files:** Modify: `apps/figma-plugin/src/ui/lib/useFigmaFillSession.ts` (extends 4.1a — same file, additive)
  - **Port-from (MIRROR, remaining slice):** `apps/chrome-extension/lib/useFillSession.ts`
  - **Depends on:** Task 4.1a; Phase 0: Task 0.5, Task 0.8 (site identity), Task 0.7
  - **Does / acceptance:**
    - `match`→ bridged-storage `store.list*()` + `matchProfiles`/`matchMappings`; **`matchSavedProfile`/`saveProfile` keyed on the Task 0.8 site identity** (file/page-derived domain) — `getActiveTab*` replaced; `SiteChip` source (consumed by 4.3).
    - `entity data`→ `api.entityTypes.list()` + `api.entityRecords.list()` direct (best-effort offline `{ok:false}`).
    - **`{ok,reason}` AI-error envelope** (`aiClassifyReason` wrapping) so the AI retry UX is unchanged.
    - **Note (does NOT include profile save/sync push/reconcile or fill-run recording — those are Phase 5).** It only prepares the matchable identity + in-session save staging that 5.1 consumes.
    - Unit test: match against stub store; site-identity derivation; AI-error envelope mapping; offline best-effort.
  - **Size:** M

- [ ] **Task 4.2 — settings / theme / display-maps**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/useSettings.ts`, `apps/figma-plugin/src/ui/lib/useTheme.ts`, `apps/figma-plugin/src/ui/lib/display-maps.ts`
  - **Port-from (MIRROR):** `apps/chrome-extension/lib/useSettings.ts`, `apps/chrome-extension/lib/useExtensionTheme.ts`, `apps/chrome-extension/lib/display-maps.ts`
  - **Depends on:** Task 2.3; Phase 0: Task 0.5
  - **Does / acceptance:**
    - `useSettings.ts`: module-level reactive `ExtensionSettings` (key `settings:extension`) over the bridged adapter; schema reused from `@quikfill/schemas`.
    - `useTheme.ts`: `html.dark` toggle (pure DOM — ports verbatim; iframe has DOM). **Theme-source authority: `prefers-color-scheme`/`matchMedia` in the iframe is AUTHORITATIVE for v1 (parity finding confirms it already works). The sandbox `figma.showUI({themeColors:true})` flag (Task 2.2) is an optional enhancement only — if both are wired, the iframe `matchMedia` path wins; the `themeColors` CSS vars are a non-binding extra.** Document this so the two paths don't conflict.
    - `display-maps.ts`: `SOURCE_META`/`AI_REASON_MESSAGE`/`SOURCE_CYCLE`/`LIMITATION_META`/`STATUS_META` + `confidenceTone`/`pct`/`mask`. Keep the `AiClassifyReason` taxonomy + `aiClassifyReason()` mapping (type-only import is chrome-free, or re-declare locally) so the AI retry UX is unchanged.
  - **Size:** M

- [ ] **Task 4.3 — panel shell + fill-flow presentational components (+ OptionRow)**
  - **Files:** Create: `apps/figma-plugin/src/ui/components/sidepanel/PanelShell.vue`, `apps/figma-plugin/src/ui/components/sidepanel/EmptyState.vue`, `FieldCard.vue`, `PlanCard.vue`, `ResultCard.vue`, `SiteChip.vue`, `SourcePill.vue`, `AiSuggestionInset.vue`, `ConfidenceMeter.vue`, `LimitationsDisclosure.vue` (all under `…/sidepanel/`), **and `apps/figma-plugin/src/ui/components/options/OptionRow.vue`** (a REAL hard dependency — `SettingsPanel.vue` line 21 does `import OptionRow from '../options/OptionRow.vue'` and renders it ~8 times; `SettingsPanel` will not compile without it). **`SettingsPanel.vue` itself is split out to Task 4.3b** because its storage re-wiring is logic, not a presentational port.
  - **Port-from:** `apps/chrome-extension/components/sidepanel/*`, `apps/chrome-extension/components/options/OptionRow.vue`
  - **Depends on:** Task 4.1a, Task 4.1b, Task 4.2, Task 3.5 (BrandLockup); Phase 0: Task 0.2, Task 0.8 (SiteChip), Task 0.9 (undo messaging)
  - **Does / acceptance:**
    - Port near-verbatim (pure `@quikfill/ui` + lucide + display-maps). `PanelShell` = header (BrandLockup, sync/hide-values/settings buttons, SiteChip, scan-scope dropdown) + phase bodies (prescan/scanning/detected/preview/results/settings) + confirm-before-fill dialog + phase footer.
    - **Adapt:** scan-scope dropdown shrinks to `selection`/`page`; drop the popup deep-link (`browser.storage.session 'ui:pendingView'`); **`SiteChip` hostname → file/page label (Task 0.8)**.
    - `ResultCard`/`LimitationsDisclosure` surface the adapter's skip-with-reason (mixed/missing-font, locked, claimed — Risk #9) **and the Task 0.9 undo-after-mutation outcome**. Never emit `assisted`.
    - `OptionRow.vue` ported as a listed deliverable (consumed by `SettingsPanel` in 4.3b).
  - **Size:** L

- [ ] **Task 4.3b — SettingsPanel + storage re-pointing (logic work, not a presentational port)**
  - **Files:** Create: `apps/figma-plugin/src/ui/components/sidepanel/SettingsPanel.vue`
  - **Port-from:** `apps/chrome-extension/components/sidepanel/SettingsPanel.vue`
  - **Depends on:** Task 4.2, Task 4.3 (OptionRow), Task 5.1 (imported/mirrored profile store) — render against `useSettings` first, bind the profile store once 5.1 lands
  - **Does / acceptance:**
    - **Re-point storage:** replace `createChromeStorageAdapter`/`createProfileStore` → the **bridged adapter** + the imported/mirrored profile store (Task 5.1). This is genuine adapter-rewiring logic, separated from the verbatim presentational ports above.
    - Renders the ~8 `OptionRow` instances and the settings surface; binds `useSettings`.
    - Unit test: settings read/write through the bridged adapter; profile-store binding smoke.
  - **Size:** M

- [ ] **Task 4.4 — wire App.vue to the session**
  - **Files:** Modify: `apps/figma-plugin/src/ui/App.vue`
  - **Depends on:** Task 4.1a, Task 4.1b, Task 4.2, Task 4.3, Task 4.3b, Task 3.7
  - **Does / acceptance:**
    - Replace the PanelShell stub with the real one; bind `useFigmaFillSession` + `useAuthGate` + `useSettings` + `useTheme`; mirror settings into the session on mount.
    - **Acceptance:** full scan→classify→preview→fill→undo works against the local backend.
  - **Size:** M

---

## Phase 5 — Parity tail

**Goal:** profile save/sync + fill-run recording reach parity with the side panel.

> **Spec-mislabel note (§7 lines 221–222):** the spec writes `api.profiles.push(...)` / `api.profiles.reconcile(...)`, but the **real api-client does not have these** — `rest-client.ts` exposes `formProfiles` (NOT `profiles`) and has **no `push`/`reconcile` methods**. `push`/`reconcile` live only inside `createBackgroundSync`'s handlers (`pushBundle`/`reconcile`). Route through `sync.handlers.pushBundle`/`reconcile` (below); **do not hunt for a nonexistent `api.profiles.*` method.**

- [ ] **Task 5.1 — profile save/sync (`sync.ts`)**
  - **Files:** Create: `apps/figma-plugin/src/ui/lib/sync.ts` (and, only if §6a fails, `apps/figma-plugin/src/ui/lib/profile-store.ts`)
  - **Port-from:** IMPORT `packages/browser-adapter/src/background-sync.ts` + `packages/browser-adapter/src/profile-store.ts` if chrome-free (Task 0.7); **drop** `packages/browser-adapter/src/profile-sync-messaging.ts` (chrome-coupled — use `createBackgroundSync` directly). **NOTE: the spec's `api.profiles.push/reconcile` is mislabeled (see above) — these are `sync.handlers.pushBundle`/`reconcile`, not api methods.**
  - **Depends on:** Task 3.3b, Task 2.3, Task 4.1b; Phase 0: Task 0.7, Task 0.8 (site identity)
  - **Does / acceptance:**
    - `createProfileStore(bridgedAdapter)` + `createBackgroundSync({api,store})` (import if verified chrome-free, else mirror).
    - Session `saveProfile()` → `sync.handlers.pushBundle({domain,profile,mappings})`; `syncNow()` → `sync.handlers.reconcile()`. Keep `PushResult`/`ReconcileResult {ok,pushed,pulled,failed,error}` shapes the UI copy depends on. **`domain`/site identity derived from file/page (Task 0.8).**
  - **Size:** M

- [ ] **Task 5.2 — fill-run recording**
  - **Files:** Modify: `apps/figma-plugin/src/ui/lib/useFigmaFillSession.ts` (adds `recordFillRun`; 4.1a/4.1b explicitly excluded this tail, so this is the only owner of fill-run logic — no double-booking)
  - **Port-from (REPLACE with direct calls):** `packages/browser-adapter/src/fill-run-messaging.ts`
  - **Depends on:** Task 3.3b, Task 4.1a
  - **Does / acceptance:**
    - `recordFillRun()` calls `api.fillRuns.create(create)` then `api.fillRuns.update(run.id, finish)` directly. Keep fire-and-forget best-effort (history never blocks a fill) + redacted payload (labels/source-type/confidence/status/reason only — never values).
  - **Size:** S

---

## Phase 6 — Polish + gate

**Goal:** invariants doc, full quality gate green, manual Figma smoke, **both** status docs updated (PLAN tables + the paused STATUS source-of-truth).

> **Note:** the `figma-env.d.ts` → `@figma/plugin-typings` typings swap that previously lived here has been **moved up to Task 1.1** (Phase 1) — the sandbox typecheck needs the real Figma API surface from Phase 2 onward, so it cannot wait until polish.

- [ ] **Task 6.1 — backfill the adapter's untested cross-realm paths**
  - **Files:** Create/extend tests under `apps/figma-plugin/src/...` (app-side integration; do **not** edit the adapter)
  - **Depends on:** Phase 2–4
  - **Does / acceptance:**
    - Integration tests for the bridge **undo** and **storage** round-trips (untested end-to-end in the adapter — only id-correlation + guards + isolated fns are covered).
    - Cover `clearStaleMarkers` pre-rescan reset, the `qf-id` fallback locator, and the locked-node / already-claimed / duplicate skip-with-reason outcomes (surfaced in `ResultCard`/`LimitationsDisclosure`).
    - **Validate the Task 0.9 decision:** `applyFigmaUndo` resolves by `selectorCandidates[0]` only (no `qf-id` fallback) — assert that undo after a node-id change surfaces the honest "target node not found" path the UI chose, rather than crashing.
  - **Size:** M

- [ ] **Task 6.2 — CLAUDE.md (per-surface invariants)**
  - **Files:** Create: `apps/figma-plugin/CLAUDE.md`
  - **Depends on:** Phases 1–5
  - **Does / acceptance:**
    - Documents the two-realm invariant, compose-don't-reimplement, review-first, the **"own dispatcher / never `mountSandboxBridge`" rule (Task 0.10 — cite the rejected alternative)**, the auth mirror rule (§6a), "parse untrusted input at the bridge boundary" (Task 0.11), the TEXT-only adapter constraint (Task 0.4), and the site-identity convention (Task 0.8).
  - **Size:** S

- [ ] **Task 6.3 — quality gate + manual Figma smoke + status reconciliation (PLAN + STATUS)**
  - **Files:** Modify: `docs/FIGMA_PLUGIN_PLAN.md` (status tables); **Modify: `docs/FIGMA_PLUGIN_STATUS.md` (un-pause / flip ON HOLD → in-progress — it is the declared single source of truth while paused and MUST not contradict the resumed build);** also reconcile the stale `mountFigmaBridge` name in `docs/FIGMA_ADAPTER_SCOPE.md`
  - **Depends on:** Task 6.1, Task 6.2
  - **Does / acceptance:**
    - `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test` all green.
    - Manual: import `manifest.json` via Plugins → Development → Import; run against the local backend; verify auth gate, scan, preview, fill, undo, save, sync; confirm the `figma.fetch` path with `networkAccess` declared.
    - **`docs/FIGMA_PLUGIN_STATUS.md` updated to reflect the resumed/in-progress state (un-paused), consistent with the PLAN tables.** Status tables in `docs/FIGMA_PLUGIN_PLAN.md` updated; scope-doc name drift fixed.
  - **Size:** M

---

## Critical path & sequencing

**Serial spine (must be in order):**

1. **Phase 0** Task 0.1 (GO) → unblocks everything; resolve 0.2, 0.3, 0.5–0.9, 0.11 before their dependents (0.4 + 0.10 are documented constraints, nothing to resolve).
2. **1.1 → 1.2 → 1.3** (skeleton + buildable artifacts; **`@figma/plugin-typings` wired into `tsconfig.code.json` at 1.1** so every later sandbox typecheck is real).
3. **2.1 → 2.2** (wire types + boundary schemas → sandbox dispatcher with Zod parse) and **2.1 → 2.3 → 2.4** (iframe transports) — converge at the 2.4 round-trip acceptance.
4. **3.1 (api skeleton, DI hooks) → 3.2 → 3.3 → 3.3b (close the loop) → 3.4 → 3.5/3.6 → 3.7.** The api ↔ iframe-auth cycle is broken by 3.1 taking `refreshAuth`/`onAuthError` as injected params and 3.3b doing the composition — **no `dependsOn` cycle** (3.1 depends on 2.4 only).
5. **4.1a (core loop) → 4.1b (match/save/identity) → 4.4** (App wiring), gated by **4.2 + 4.3 + 4.3b**.
6. **5.1, 5.2** (parity tail) → **6.1 → 6.2 → 6.3** (gate).

**Parallelizable:**

- Phase 0 decisions can be resolved concurrently once 0.1 lands.
- Within Phase 2: the sandbox leg (2.2) and the iframe leg (2.3→2.4) proceed in parallel after 2.1.
- Within Phase 3: `auth-store` (3.2), `iframe-auth` (3.3), and the supporting auth presentational components (3.5) can be drafted in parallel; only `useAuth`/`useAuthGate` (3.4), `AuthPanel` (3.6), the wire (3.3b), and `App.vue` (3.7) must integrate them. `BrandLockup` (in 3.5) can land as early as Phase 1.
- Within Phase 4: `useSettings`/`useTheme`/`display-maps` (4.2) and the presentational components (4.3) can be ported in parallel with `useFigmaFillSession` (4.1a→4.1b); they converge at 4.4. `SettingsPanel` (4.3b) waits on 5.1 for the profile store.
- Phase 5 (5.1, 5.2) are independent of each other (both depend on 4.1's split, not on each other).
- Task 6.2 (CLAUDE.md) can be drafted any time after the architecture is set; 6.1 follows once the bridge/session exist.

## Definition of done (ship)

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test` all green.
- [ ] `pnpm build` emits `dist/code.js` (sandbox IIFE) + `dist/ui.html` (single inlined file); plugin **installs via Plugins → Development → Import** in Figma desktop.
- [ ] Full side-panel parity verified in a **real Figma runtime**: email-OTP **auth** + reactive-on-401 refresh, **scan → classify (local + AI) → preview → fill → undo**, profile **save → sync**, and **fill-run** recording.
- [ ] `figma.fetch`-via-bridge confirmed as the prod path with `networkAccess.allowedDomains` declaring the API origin (CORS-free); `QF_NET=iframe` dev path works behind the build flag.
- [ ] `code.ts` uses its **own** dispatcher (network branch present, inbound payloads Zod-parsed); `mountSandboxBridge()` is **not** called.
- [ ] **Bridge boundary parses untrusted input** (Task 0.11): `figmaSelectionScopeSchema` + `instructions`/`snapshot`/`op`/`request` parsed sandbox-inbound and the `RESPONSE` envelope parsed iframe-inbound.
- [ ] **Adapter untested paths backfilled** (app-side, adapter unmodified): bridge **undo** + **storage** round-trips, `clearStaleMarkers` pre-rescan reset, `qf-id` fallback locator, and locked / duplicate / claimed / missing-font **skip-with-reason** outcomes surfaced honestly in `ResultCard`/`LimitationsDisclosure`, **plus the undo-after-mutation outcome (Task 0.9)**.
- [ ] `figma-env.d.ts` ambient stub **swapped** for the `@figma/plugin-typings` devDep + `"types":["@figma/plugin-typings"]` **in `tsconfig.code.json` from Phase 1**; `@quikfill/figma-adapter` consumed **without modification**.
- [ ] Phase 0 decisions resolved & documented: fill primitive, `domFingerprint` input, `clientStorage` quota strategy, **site/tab identity (Task 0.8)**, **undo-after-mutation UX (Task 0.9)**, **bridge-boundary Zod parse (Task 0.11)**, and the reuse-vs-mirror sync verification (Task 0.7). The TEXT-only variant scope (Task 0.4) and the own-dispatcher path (Task 0.10) are documented as **fixed constraints**, not choices.
- [ ] **Packaging placeholders resolved** _(prod-only, non-blocking for the build)_: real prod API domain in `manifest.networkAccess.allowedDomains` (Risk #2 — `figma.fetch` is gated on it) and the Figma plugin `id` (assigned by Figma on first publish).
- [ ] `apps/figma-plugin/CLAUDE.md` written; `docs/FIGMA_PLUGIN_PLAN.md` status tables updated; **`docs/FIGMA_PLUGIN_STATUS.md` un-paused/updated (it is the declared source of truth while paused and must not contradict the resumed build)**; stale `mountFigmaBridge` name in `docs/FIGMA_ADAPTER_SCOPE.md` reconciled to `mountSandboxBridge`.

> **Out of scope / future (NOT part of this build):** Figma Community submission / publishing. Per spec §12 the plugin `id` is assigned on first publish (placeholder until then) and publishing is explicitly out of scope / non-blocking; `docs/FIGMA_PLUGIN_STATUS.md` keeps publishing out of the build envelope. Community submission is a separate future step, deliberately **not** a DoD item.
