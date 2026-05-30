# `@quikfill/figma-adapter` — Package Scope (Exploratory)

> **Scope, not an approval.** This specifies the structure of the Figma host
> adapter + plugin entrypoints in implementation-ready detail. It does **not**
> authorize a build — that stays 🔒 blocked on the product user-base call (see
> [`FIGMA_PLUGIN_PLAN.md`](./FIGMA_PLUGIN_PLAN.md)). When the gate clears, this
> converts directly into the scaffold. Grounded in the real contracts
> (`@quikfill/schemas`, `autofill-core`, `form-scanner`, `browser-adapter`) and
> adversarially reviewed; the corrections from that review are folded in, with the
> notable ones flagged inline as **[review]**.

## The one constraint that shapes everything: two realms

A Figma plugin runs in **two** JS environments. Every placement decision below
follows from this:

| Realm                          | Has                                                  | Lacks                               | Runs                                                                                  |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| **Sandbox** (`code.ts`)        | `figma` global, the node tree, `figma.clientStorage` | **no DOM, no `fetch`, no `window`** | scan / fill / fonts / fingerprint / storage I/O                                       |
| **UI iframe** (`figma.showUI`) | full DOM, `fetch`, `window`                          | no `figma` global, no node tree     | Vue UI + the **pure engine** (`autofill-core`, `ai`) + **all network** (`api-client`) |

This is the **3-realm → 2-realm collapse** of the extension: the content-script's
node-ownership role → the sandbox; the background worker's network duties **merge
into** the iframe (the iframe is itself the fetch realm, so the `chrome.runtime`
hop disappears).

`@quikfill/figma-adapter` owns **only the sandbox-side Figma I/O + shared wire
types**. The Vue UI, the engine composition, and all network live in
`apps/figma-plugin`.

## Design rules (inherited, non-negotiable)

1. **Mirror, never import.** `form-scanner` is DOM-coupled and `browser-adapter`
   references `chrome.*`; importing either into a no-DOM/no-chrome package is wrong.
   The adapter **re-derives** their public surface (`scanForms`→`scanFigma`,
   `applyFill`/`applyUndo`→`applyFigmaFill`/`applyFigmaUndo`,
   `createChromeStorageAdapter`→`createFigmaClientStorageAdapter`, the messaging
   envelope) **typed against the same `@quikfill/schemas` contracts**, so the rest
   of the app is unchanged.
2. **Never reimplement the engine.** `classify` / `buildPreviewPlan` / `buildFillPlan`
   / generators stay in `autofill-core` and run in the **iframe**. The adapter only
   **produces `DetectedField[]`** and **consumes `FillInstruction[]`**.
3. **Schemas first, but only where they cross a trust boundary.** **[review]** Add a
   Zod schema only for data that crosses the bridge / is persisted. Same-realm
   function return types stay plain TypeScript.
4. **Not Vue-aware, not Chrome-aware.** The adapter compiles with **no DOM lib**.

---

## `packages/figma-adapter`

```jsonc
// package.json — mirror form-scanner/browser-adapter exactly
{
  "name": "@quikfill/figma-adapter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@quikfill/schemas": "workspace:*" }, // the ONLY runtime dep
  "devDependencies": { "@figma/plugin-typings": "^1", "typescript": "~6.0.3", "vitest": "^3.2.4" },
}
```

- **`@quikfill/schemas` is the only runtime dependency.** No `autofill-core` (engine
  runs in the iframe), no `form-scanner`/`browser-adapter` (mirrored, not imported),
  no `chrome`/`vue`.
- **tsconfig** extends `../config/tsconfig.base.json` but **overrides**:
  `lib: ["ES2023"]` (**no `DOM`/`DOM.Iterable`** — the sandbox has no DOM) and
  `types: ["@figma/plugin-typings"]` (the `figma`/`SceneNode`/`TextNode`/`FontName`
  globals; the mirror of `browser-adapter`'s `types: ["chrome"]`).
- **[review] The package is sandbox-pure.** It contains **no `window`/`parent`
  code** — the iframe-side transport lives in the app (resolves the no-DOM tsconfig
  vs. iframe-helpers contradiction). The barrel re-exports only the sandbox engine +
  shared wire constants/types/guards.

### Files

| File                       | Realm            | Responsibility & key exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`             | shared           | Adapter-local **TS** types (no Zod): `FigmaFillOutcome { results: FillResult[]; undoSnapshot: UndoSnapshot }` (mirror of `FillOutcome`), `FigmaNodeRef { nodeId: string; framePath: string[]; pageId?: string }` **[review: plain type, not a schema]**, `FontLoadOutcome` discriminated union, internal walk context. All **wire/persisted** shapes stay in `@quikfill/schemas`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/fingerprint-figma.ts` | sandbox          | Produce the stable `domFingerprint` every `DetectedField` requires (no default → parse throws). **[review] Best-effort stability, not a guarantee:** hash = ordered ancestor frame/component **names** (`framePath`) + layer name + node kind, mirroring `form-scanner`'s exclusion of volatile signals. Known break cases documented inline: frame rename, file duplication. `figmaStructureHash` is a **verbatim** copy of `structureHash`'s format. `fnv1aHex` is an 8-line local copy of `form-scanner/hash.ts` (we never import that package). Exports: `figmaFingerprint(input)`, `figmaStructureHash(fields)`, `fnv1aHex(s)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/fonts.ts`             | sandbox          | The one piece with no `form-scanner` analog (DOM has no font gate). `fontsOfNode(node)` → distinct `FontName[]`, using **`node.getRangeAllFontNames(0, len)`** as the primary path for `figma.mixed` (**[review]** one call, not O(n) per-char). `ensureFontsLoaded(node)` → `await loadFontAsync` for each distinct font (deduped), returns `FontLoadOutcome`: `{status:'ready'}` \| `{status:'missing', fonts}` \| `{status:'mixedUnhandled'}`. `isMixed(v)` guards the `figma.mixed` symbol. **Plain TS return type** — same-realm, not a schema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/scan-figma.ts`        | sandbox          | **Mirror of `scanForms`.** Walk `figma.currentPage` (or `.selection` per scope) → **`ScanResult`** (`{ fields: DetectedField[], limitations, structureHash, scope? }`). Per fillable `TextNode`, synthesize **all required fields** — `id` (scan-unique), `tagName:'figma:text'`, `inputType:'text'`, `domFingerprint` — and route **layer name + current text → `labelText`/`name`/`currentValue`** so the classifier (which reads only text fields, via `labelText \|\| name \|\| domId \|\| id`) works unchanged. **[review] confirmed: no phantom `label` field.** `selectorCandidates:[node.id]` (the Figma locator). `figma.locked`→`disabled:true`, `node.visible===false`→`visible:false` so the planner auto-skips/flags (`plan.ts:45-53`). Stamps `node.setPluginData('qf-id', id)` (pluginData **is** string-only — fine for an id) as a fast-path marker. Does **not** classify or plan. Exports: `scanFigma(scope?, options?)`, `nodeToDetectedField(node, ctx)`, `clearStaleMarkers(root)`.                                                                                                   |
| `src/fill-figma.ts`        | sandbox          | **Mirror of `applyFill`/`applyUndo`.** Consume **`FillInstruction[]`** (the selector-bearing shape; the iframe joins it from `FillPlanItem` + `DetectedField`). Per instruction: **[review] resolve node by `getNodeById(selectorCandidates[0])` FIRST** (Figma ids are stable within a file/session), fall back to the `qf-id` marker only if gone — avoids writing the wrong node after an interleaved re-scan. **Capture `previousValue = node.characters` before writing** (undo). `ensureFontsLoaded` gate, then `node.characters = proposedValue`. **[review]** skip independently when `proposedValue===''`; **wrap the write in try/catch** → `status:'failed'` (Figma rejects some control chars / length) so it **never throws per field**. Emits only `success` \| `skipped` \| `failed` — **never `'assisted'`** (no autocomplete realm in Figma; the 4-value enum still types the iframe's `FillRun` recording). The 4 non-`nativeInput` strategies are skipped-with-reason for v1. Exports: `applyFigmaFill(instructions)` → `FigmaFillOutcome`, `applyFigmaUndo(snapshot)` → `FillResult[]`. |
| `src/storage-figma.ts`     | sandbox          | **Mirror of `createChromeStorageAdapter`** over `figma.clientStorage`. **[review] `clientStorage` is NOT string-only** — `getAsync`/`setAsync` structured-clone live values exactly like `chrome.storage`, so **no `JSON.stringify`/`parse`** (that would silently change the value shape callers expect). The **only** deviation: `list(prefix)` uses `keysAsync()` + `startsWith` (there is no bulk `get(null)`). Exports: `createFigmaClientStorageAdapter(): StorageAdapter` (`get`/`set`/`delete`/`list`). **[review] Runs only in the sandbox** (`clientStorage` is on the `figma` global) — the iframe reaches it via the bridge (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/bridge.ts`            | sandbox + shared | **Mirror of `browser-adapter/messaging.ts`**, sandbox half only. Shared: the `SCAN/FILL/UNDO/STORAGE` message **constants**, message **interfaces**, and `isXRequest` **guards** (reused verbatim so the envelope is identical). Sandbox: `onScanRequest`/`onFillRequest`/`onUndoRequest`/**`onStorageRequest`** registrars on `figma.ui.onmessage`, and `mountFigmaBridge()` (`figma.showUI` + dispatch). **[review]** Figma `postMessage` is one-shot (no per-call `sendResponse`), so replies are **correlated by a generated message id**. **[review] No `NETWORK_RELAY`** (admitted dead code — all fetch is in the iframe by design). The **iframe-side** `requestScan/Fill/Undo/storage` helpers live in the **app** (DOM realm), importing these constants/guards.                                                                                                                                                                                                                                                                                                                                  |
| `src/index.ts`             | shared           | Barrel: re-export `scanFigma`/`nodeToDetectedField`/`clearStaleMarkers`, `applyFigmaFill`/`applyFigmaUndo`/`FigmaFillOutcome`, `createFigmaClientStorageAdapter`, `figmaFingerprint`/`figmaStructureHash`/`fnv1aHex`, `ensureFontsLoaded`/`fontsOfNode`/`isMixed`, and the bridge constants/guards/registrars + message types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/*.test.ts`            | sandbox          | Vitest against a hand-stubbed `figma` global (mirroring `form-scanner`/`browser-adapter` tests): `scan-figma` (output parses against `detectedFieldSchema`; fingerprint stable across re-scan, changes on rename/reparent; locked→disabled), `fill-figma` (capture-before-write, font gate skip, empty-value skip, invalid-char→failed, undo restores, never `'assisted'`), `storage-figma` (**object** round-trip — not JSON; `null` for absent; `list` filters `keysAsync`), `bridge` (id correlation + guards).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## Additions to `@quikfill/schemas`

**[review] Lean footprint** — add to a new `packages/schemas/src/figma.ts` and export
from `index.ts`:

- **`figmaSelectionScopeSchema = z.enum(['selection','page'])`** — the **only** new
  schema. It crosses the bridge (`requestScan` arg), so it must parse untrusted
  input. (`'selection'` → `figma.currentPage.selection`; `'page'` → whole page. Not
  reusing `scanScopeSchema`, whose `auto/form/dialog` are DOM-container concepts.)

That's it. `scanFigma` returns the **existing** `ScanResult` (no new scan schema —
**[review]** avoids the self-contradicting `extend`). `FigmaNodeRef`, the font
descriptor, and the font outcome are **plain TS types** in the adapter (same-realm,
never persisted/transmitted → no Zod tax).

---

## `apps/figma-plugin`

| File                                | Realm   | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest.json`                     | config  | `name`, `id`, `api`, `editorType:["figma"]` (Design mode — Dev Mode is read-only), `main:"dist/code.js"`, `ui:"dist/ui.html"`, **`networkAccess: { allowedDomains: ["<api origin>"], reasoning: "<why>" }`** (**[review]** newer manifests want the reasoning string; sandbox needs no network, the **iframe** needs the API origin allow-listed).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/code.ts`                       | sandbox | Entry — mirrors `content.ts`. `figma.showUI(__html__, …)`, then `onScanRequest(s => scanFigma(s, opts))`, `onFillRequest(i => applyFigmaFill(i))`, `onUndoRequest(s => applyFigmaUndo(s))`, `onStorageRequest(op => createFigmaClientStorageAdapter()[op]…)`. No classify/plan/network.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/ui/`                           | iframe  | Vue app (mirror of the side panel). `main.ts` bootstrap; `App.vue` drives the session machine via `useFigmaFillSession`; reuses shadcn components **from `@quikfill/ui`** (anything surface-local must be promoted there first). AI is **review-first**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/ui/lib/useFigmaFillSession.ts` | iframe  | The **orchestrator** (mirror of `lib/useFillSession.ts`): (1) `requestScan()` → `ScanResult`; (2) run the **pure engine in the iframe** — `buildPreviewPlan`/`classifyFields`/`matchProfiles`/`matchMappings` (`autofill-core`) + `buildFieldSummaries`/`suggestionToProposal` (`ai`); (3) call `api-client` **directly** for AI classify / entity data / sync / `FillRun` (the iframe **is** the fetch realm — no background hop); (4) build **`FillInstruction[]`** by joining each `FillPlanItem` (`proposedValue`/`fillStrategy`/`detectedFieldId`) with its `DetectedField` (`selectorCandidates`/`tagName`/`inputType`), then `requestFill()`; (5) keep `undoSnapshot` for `requestUndo()`; (6) **redact** to `RedactedFillPlanItem` before recording a `FillRun`. |
| `src/ui/lib/transport.ts`           | iframe  | **[review]** The iframe-side bridge half (lives here, **not** in the adapter, because it touches `window`/`parent`): `requestScan/Fill/Undo` + a **`createBridgeStorageAdapter()`** that implements `StorageAdapter` by forwarding `get/set/delete/list` over the bridge to the sandbox's `createFigmaClientStorageAdapter` (**[review] fixes the realm bug** — the iframe cannot call `figma.clientStorage` itself). Profile/auth stores mount on **this** proxy.                                                                                                                                                                                                                                                                                                       |
| `tsconfig*.json` + bundler          | config  | **Two outputs:** `code.ts` → sandbox **IIFE** (`lib ES2023`, `types ['@figma/plugin-typings']`, no DOM, no ESM `import`); `ui/` → **single-file HTML** (`lib ES2023,DOM`, Vue). **[review]** the bundler must split per entry so the sandbox bundle never pulls `window`-touching code — made clean by the adapter being sandbox-pure. Pick the bundler to match the existing Vite toolchain (`vite` + `vite-plugin-singlefile`, or `@create-figma-plugin`).                                                                                                                                                                                                                                                                                                             |
| `CLAUDE.md`                         | config  | The two-realm rule + the compose-don't-reimplement + review-first invariants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## The contract crux (one-paragraph recap)

`scan-figma` **produces** `DetectedField[]` (synthesizing `id`/`tagName`/`inputType`/
stable `domFingerprint`, routing the layer name into `labelText`). The iframe runs
the unchanged engine to get a `FillPlan`, then joins each `FillPlanItem`
(`detectedFieldId` is the join key; it carries **no** selectors) with its
`DetectedField` to build `FillInstruction[]`. `fill-figma` **consumes** those, maps
`detectedFieldId → node`, loads fonts, writes `node.characters`, and returns
`FillResult[]` + an `UndoSnapshot`. `domFingerprint` keys saved mappings
(`plan.ts:88`) — it **is** the cross-surface-persona moat, so its stability is the
contract that matters most.

## Open decisions (genuinely open after review)

- **Fill primitive:** `node.characters =` (whole-string, drops rich-text runs) vs.
  `insertCharacters` (preserves runs). Recommend `characters` for v1; `fonts.ts`
  already skips the `mixedUnhandled` case.
- **`domFingerprint` inputs:** name-path + layer name (breaks on frame rename) vs.
  `node.id` (breaks on file duplication). No input survives both — pick name-path for
  v1 (matches `form-scanner`) and document the break cases. **Resolve before build.**
- **Variant components as `select`:** map a component-set instance to
  `inputType:'select'` + `options[]` (filler swaps the variant via `setProperties`) or
  stay text-only for v1? Recommend text-only v1.
- **Auth in the iframe (prerequisite, not just a decision):** **[review]** the
  extension's email-OTP gate assumes a background worker; in Figma the **whole**
  auth/refresh flow must run in the iframe over the bridged storage adapter, and Figma
  may **unmount the iframe when the plugin closes** (refresh-timer lifecycle). Needs a
  concrete port plan before any networked flow.
- **`clientStorage` limits:** ~5 MB total / 100 KB per entry — large profile bundles
  may need chunking vs. `chrome.storage.local`.

## Build sequence (when the gate clears)

1. `@quikfill/schemas`: add `figmaSelectionScopeSchema`.
2. `packages/figma-adapter`: `fingerprint-figma` + `fonts` → `scan-figma` → `fill-figma`
   → `storage-figma` → `bridge` → `index`, each with its Vitest stub. (No app yet —
   the adapter is testable headless against a stubbed `figma` global.)
3. `apps/figma-plugin`: `manifest` + `code.ts` (thin) → `ui/transport.ts` →
   `useFigmaFillSession` → `App.vue`, reusing `@quikfill/ui`.
4. Resolve the auth-in-iframe port and the `domFingerprint` input decision **before**
   wiring networked flows.
