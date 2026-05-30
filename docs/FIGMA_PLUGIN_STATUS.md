# Figma Plugin — Project Status

**Status: ON HOLD (paused 2026-05-30)**

> This document supersedes the live plan docs (`docs/FIGMA_PLUGIN_PLAN.md`, `docs/FIGMA_ADAPTER_SCOPE.md`, `docs/superpowers/specs/2026-05-30-figma-plugin-design.md`) as the single source of truth for project state while paused. Where those docs disagree (see Open questions), trust this status.

## TL;DR

The Figma plugin was a planned fourth Quikfill surface (`apps/figma-plugin`) intended to reach full feature parity with the Chrome extension by reusing the shared engine packages and isolating Figma-API specifics in a new host adapter. The arc reached: research/requirements brief → R2 autofill-feasibility gate **cleared (GO-for-forms, 93% recall / 93% type-precision)** → `@quikfill/figma-adapter` library **scaffolded, type-clean, and fully tested (31 tests passing)** → `apps/figma-plugin` scaffold **designed and approved but never built**. The reusable "brains" (adapter library, classifier gate corpus, one new schema) have all landed and been committed; what is missing is the host app that bundles them into Figma's two realms. The project is paused before any runnable/installable plugin artifact exists — there is no `apps/figma-plugin` directory, no `manifest.json`, no UI thread, no controller (sandbox) thread, and nothing yet imports the adapter. The stated blocker is a still-open product user-base decision (with a documented conflict between the plan doc and the design doc on whether that gate is cleared).

## Where it stands

Phases reached vs not reached, in order:

1. ✅ **R1 — Feasibility research** (architecture + competitive scan) — Done.
2. ✅ **R1b — Audit of the brief against the real codebase + live Figma docs** (2026-05-30) — Done.
3. ✅ **R2 — Classifier decision gate** (two-tier corpus on Figma layer names) — Done, GO-for-forms.
4. ✅ **`@quikfill/figma-adapter` library** (scan/fill/undo/fingerprint/fonts/storage/bridge) — Built, tested, committed.
5. ✅ **`apps/figma-plugin` scaffold design spec** — Approved (2026-05-30).
6. 🔒 **Build phase** (the actual plugin app: skeleton → bridge+transports → network+auth → session → parity tail → polish/gate) — **Not started.** All six build phases from the design spec are unimplemented because the app directory does not exist. The plan's status table marks Build as "Blocked on the product user-base check."

## ✅ What's done

### Feasibility & research

- **R1 feasibility research** marked Done in the plan status table — evidence: `docs/FIGMA_PLUGIN_PLAN.md` (lines 21–26, Status table, R1 = Done).
- **R1b codebase + live-Figma audit** marked Done (2026-05-30) — evidence: `docs/FIGMA_PLUGIN_PLAN.md` line 24; git commit `10a9337` ("correct plugin plan after codebase+Figma audit").
- **R2 decision gate result documented**: two-tier gate, forms 93% recall / 93% type-precision = GO-for-forms; arbitrary dashboards 44% recall = out of v1 scope — evidence: `docs/FIGMA_PLUGIN_PLAN.md` (lines 222–269, gate + result table).
- **Two classifier precision bugs surfaced by the spike are fixed** (count→county/discount→number; date→updated/validate→date) using word boundaries, with a regression guard — evidence: `docs/FIGMA_PLUGIN_PLAN.md` lines 257–259, 281–285; `packages/autofill-core/src/classify-precision.test.ts`; git commit `f546223`.
- **Adapter package scope is implementation-ready** — evidence: `docs/FIGMA_ADAPTER_SCOPE.md` (module-by-module scope, single new schema, "No NETWORK_RELAY" decision, build sequence).
- **Scaffold design approved with key decisions locked** (Vite + vite-plugin-singlefile bundler, both networking transports, full side-panel parity) — evidence: `docs/superpowers/specs/2026-05-30-figma-plugin-design.md` (lines 3–24, Status: design approved).

### figma-adapter library (`packages/figma-adapter`)

The adapter is the Figma-sandbox mirror of the DOM `form-scanner`/`browser-adapter`. Every public function is fully implemented — no stubs, TODOs, FIXMEs, placeholders, or "not implemented" throws in production source.

- **Public API barrel** re-exports the full adapter (scan, fill, undo, storage, fingerprint, fonts, bridge constants/guards/registrars, and the `FigmaFillOutcome`/`FigmaNodeRef`/`FontLoadOutcome` types) — evidence: `packages/figma-adapter/src/index.ts`.
- **`scan-figma.ts`** — recursive node-tree walk; maps TEXT nodes to `DetectedField` (validated by `detectedFieldSchema`), assigns a `qf-id` pluginData marker, computes a structure hash; handles selection vs page scope and hidden/non-fillable opt-in. Exports `scanFigma`, `nodeToDetectedField`, `clearStaleMarkers`, `QF_ID_KEY` — evidence: `packages/figma-adapter/src/scan-figma.ts`.
- **`fill-figma.ts`** — per-field fill engine: resolves node (by id then `qf-id` marker), de-dupes within batch, skips empty/non-`nativeInput`/locked/missing-font/mixed-font, captures undo entries, writes `node.characters` in try/catch (never throws per field), returns `success|skipped|failed`; `applyFigmaUndo` restores `previousValue`. Exports `applyFigmaFill`, `applyFigmaUndo` — evidence: `packages/figma-adapter/src/fill-figma.ts`.
- **`fingerprint-figma.ts`** — FNV-1a hash + stable fingerprint from framePath/layerName/nodeKind, and `figmaStructureHash` matching `form-scanner`'s format verbatim. Exports `figmaFingerprint`, `figmaStructureHash`, `fnv1aHex`, `FigmaFingerprintInput` — evidence: `packages/figma-adapter/src/fingerprint-figma.ts`.
- **`fonts.ts`** — `isMixed` (figma.mixed identity check), `fontsOfNode`, `ensureFontsLoaded` (awaits `loadFontAsync`, downgrades to mixedUnhandled/missing/ready, never throws) — evidence: `packages/figma-adapter/src/fonts.ts`.
- **`storage-figma.ts`** — complete `StorageAdapter` over `figma.clientStorage` (get/set/delete + list via `keysAsync` prefix filter) — evidence: `packages/figma-adapter/src/storage-figma.ts`.
- **`bridge.ts`** — sandbox half of the request/response envelope: message constants, typed interfaces, type guards, `on*Request` registrars, dispatch + reply via `figma.ui.postMessage`, `mountSandboxBridge`; correlates replies by caller-supplied id; intentionally has **no** NETWORK_RELAY message — evidence: `packages/figma-adapter/src/bridge.ts`; matches `docs/FIGMA_ADAPTER_SCOPE.md` ("No NETWORK_RELAY").
- **`types.ts`** — shared types `FigmaFillOutcome`, `FigmaNodeRef`, `FontLoadOutcome` — evidence: `packages/figma-adapter/src/types.ts`.
- **Headless test harness** — `figma-env.d.ts` ambient typings (local stand-in for `@figma/plugin-typings`) and `test-support.ts` in-memory figma stub let the package type-check and test with no live Figma runtime — evidence: `packages/figma-adapter/src/figma-env.d.ts`, `packages/figma-adapter/src/test-support.ts`.
- **Registered, resolvable pnpm workspace package** — evidence: `pnpm-lock.yaml` (`packages/figma-adapter:`), `pnpm-workspace.yaml` (`packages/*`); committed in `50d442a`.

### Tests & schemas

- **figma-adapter unit tests** — six test files (one per source module), 31 tests, all passing against the in-memory figma stub — evidence: `packages/figma-adapter/src/{scan-figma,fill-figma,bridge,fonts,fingerprint-figma,storage-figma}.test.ts`.
- **R2 classifier gate** — feasibility/decision test running the real `classifyField` over a labeled 130-name two-tier corpus, asserting GO/NO-GO bars (forms recall ≥ 0.8, precision ≥ 0.85, noiseFP ≤ 0.2; dashboards materially worse; decoration FP ≤ 0.05; corpus length ≥ 120); passes 4/4 — evidence: `packages/autofill-core/src/figma-r2-gate.test.ts`, `packages/autofill-core/src/figma-r2-corpus.ts` (130 labeled names; tiers forms=63 / dashboard=46 / decoration=21).
- **New Figma schema** — `figmaSelectionScopeSchema = z.enum(['selection','page'])` with `FigmaSelectionScope` type, the only new Zod schema, re-exported via the schemas barrel and consumed by `scan-figma.ts`/`bridge.ts` — evidence: `packages/schemas/src/figma.ts`, `packages/schemas/src/index.ts` (`export * from './figma'`).
- The adapter otherwise reuses existing web schemas (`DetectedField`, `FillInstruction`, `ScanResult`, `UndoSnapshot`, `FillResult`, `StorageAdapter`) — all dependencies resolve, no dangling imports.

## 🚧 What's missing to ship

Ordered by size of gap, biggest first.

1. **The entire `apps/figma-plugin` host app does not exist.** This is the whole remaining deliverable.
   - **No app directory** — `ls apps` shows only `app`, `chrome-extension`, `e2e`, `website`; `apps/figma-plugin` is absent. _Why:_ without it there is nothing to build, install, or run in Figma.
   - **Nothing imports `@quikfill/figma-adapter`** — repo-wide grep returns only its own `package.json` name declaration. _Why:_ the adapter is an orphan/dead library until an app composes it.
   - **No `manifest.json`** (editorType/main/ui/networkAccess). _Why:_ Figma cannot import or run a plugin without it; this is the single hard requirement that makes the libraries installable via Plugins → Development → Import.
   - **No sandbox/controller thread (`code.ts`)** — the adapter ships bridge guards/registrars but no `code.ts` dispatcher. Per the spec, `code.ts` must install its **own** dispatcher (built from the adapter's exported guards) rather than calling `mountSandboxBridge()`, so a network message can be added. _Why:_ without the sandbox entry there is nothing to install as `main`.
   - **No UI (iframe) thread** — no Vue app, no bridge-client, no bridged-fetch/storage. _Why:_ the iframe is where the engine and orchestration run.
   - **No build configuration** — the two Vite configs (`vite.config.code.ts` IIFE sandbox + `vite.config.ui.ts` single-file HTML via `vite-plugin-singlefile`) the spec mandates are unwritten. _Why:_ every `@quikfill/*` package is source-only (`main: ./src/index.ts`); Figma needs ONE IIFE sandbox file + ONE inlined-HTML UI, so without these configs no runnable artifact can be emitted.
   - **No `@figma/plugin-typings` wiring** in an app (adapter uses a local ambient stub). _Why:_ a real plugin needs the official typings + a `tsconfig.code`/`tsconfig.ui` split.

2. **Networking transports.** Both transports (`figma.fetch`-via-bridge default + iframe-fetch behind a `QF_NET` flag) plus bridged `Response` reconstruction (`bridged-fetch.ts`, `net-transport.ts`, `net/messages.ts`). _Why:_ the sandbox has no standards `fetch`; this is required for any networked flow (auth, AI classify, profile sync) and is the explicitly-flagged crux of the realm split.

3. **Auth port to the iframe realm.** `auth-store.ts` + `iframe-auth.ts` mirroring `browser-adapter`, the `useAuthGate` screen FSM, and OTP components, all over bridged storage. _Why:_ email-OTP auth is part of "full parity"; the docs flag this as a genuine prerequisite because the extension's auth assumes a background worker and Figma may unmount the iframe on close.

4. **Session orchestrator + UI parity.** `useFigmaFillSession` (a near-verbatim port of the ~888-line `lib/useFillSession.ts`) plus sidepanel/auth Vue components reusing `@quikfill/ui`. _Why:_ this is the scan→classify→preview→fill→undo→save→sync→fill-run-record loop — the core product behavior and the bulk of the parity work. Parity here is feature/UX parity, not tooling parity (chrome-extension uses WXT; Figma cannot).

5. **End-to-end testing inside a real Figma runtime.** Untested adapter paths (bridge undo/storage requests, `clearStaleMarkers`, the `qf-id` marker fallback, locked-node and duplicate-claim skips) plus build-risk areas (component-instance text writability, the `figma.fetch` network shim) and `domFingerprint` stability under benign edits. _Why:_ all current tests run headless against a stub; nothing has been verified against live Figma, and `domFingerprint` is the cross-surface persona moat.

6. **Packaging & publishing.** Resolve placeholder prod API domain (for `manifest.networkAccess.allowedDomains`) and the Figma plugin id (assigned on first Community publish); complete Figma Community submission/review. _Why:_ both placeholders block a publishable build even after the app is scaffolded.

## Verification (as of pause)

All three Figma health-check commands were run from `frontend/` and succeeded. Nothing was modified.

| Command                                               | Result                                          |
| ----------------------------------------------------- | ----------------------------------------------- |
| `pnpm --filter @quikfill/figma-adapter test`          | ✅ PASS — 31/31 tests across 6 files            |
| `pnpm --filter @quikfill/figma-adapter typecheck`     | ✅ PASS — `tsc --noEmit` clean, no errors       |
| `pnpm --filter @quikfill/autofill-core test figma-r2` | ✅ PASS — 4/4 tests (R2 decision table printed) |

R2 decision table printed by the gate run (reported, not failing):

```
[R2] forms      n= 63 fillable=44 | recall= 93% typePrecision= 93% noiseFP= 16%
[R2] dashboard  n= 46 fillable=25 | recall= 44% typePrecision=100% noiseFP= 10%
[R2] decoration n= 21 fillable= 0 | recall=100% typePrecision=100% noiseFP=  0%
```

Note: dashboard recall is 44%, but this is _reported_ by a deliberately bimodal gate (dashboards out of v1 scope) — the test still passes.

## File & artifact inventory

**Docs**

- `docs/FIGMA_PLUGIN_PLAN.md` — research/requirements brief; R1/R1b/R2 status table; decision gate; open build-gate questions. Still lists Build as "Blocked on the product user-base check."
- `docs/FIGMA_ADAPTER_SCOPE.md` — implementation-ready adapter package scope; module list; single new schema; "No NETWORK_RELAY"; build sequence; open decisions.
- `docs/superpowers/specs/2026-05-30-figma-plugin-design.md` — approved scaffold design for `apps/figma-plugin` (file tree, two realms, bridge, dual-transport networking, auth port, session port, build configs, 6 phases).

**figma-adapter package (`packages/figma-adapter/src/`)**

- `index.ts` — public API barrel.
- `scan-figma.ts` — recursive TEXT-node scan → `DetectedField`; `qf-id` marker; structure hash.
- `fill-figma.ts` — per-field fill engine + `applyFigmaUndo`.
- `fingerprint-figma.ts` — FNV-1a hash, stable fingerprint, `figmaStructureHash`.
- `fonts.ts` — mixed-font detection + `ensureFontsLoaded`.
- `storage-figma.ts` — `StorageAdapter` over `figma.clientStorage`.
- `bridge.ts` — sandbox-side message envelope (constants, guards, registrars, `mountSandboxBridge`); no network message by design.
- `types.ts` — `FigmaFillOutcome`, `FigmaNodeRef`, `FontLoadOutcome`.
- `figma-env.d.ts` — local ambient figma typings (to be swapped for `@figma/plugin-typings`).
- `test-support.ts` — in-memory figma stub driving all tests.
- `*.test.ts` (six files) — 31 passing unit tests.
- `package.json`, `tsconfig.json` — workspace config (note: `typecheck` + `test` scripts only; no `build`/`lint`).

**Schema**

- `packages/schemas/src/figma.ts` — `figmaSelectionScopeSchema` (the only new Figma schema) + `FigmaSelectionScope`.
- `packages/schemas/src/index.ts` — barrel re-export (`export * from './figma'`).

**Classifier R2 gate (`packages/autofill-core/src/`)**

- `figma-r2-corpus.ts` — 130 labeled layer names (forms 63 / dashboard 46 / decoration 21) with ground-truth `expectedType`.
- `figma-r2-gate.test.ts` — feasibility/decision gate running the real `classifyField`; encodes GO-for-forms scope as an executable contract.
- `classify-precision.test.ts` — regression guard for the two precision bugs fixed during the spike.

**Git arc (all 2026-05-30):** `445433a` research brief → `10a9337` plan correction + R2 spike → `f546223` classifier bugs fixed → `091b982` two-tier R2 gate → `8a065a1` adapter scope doc → `50d442a` figma-adapter scaffold → `08f15c6` design spec.

## Open questions & risks

- **Product user-base GO decision (the stated real blocker).** `docs/FIGMA_PLUGIN_PLAN.md` keeps Build "Blocked on the product user-base check"; the dependent monetization free-vs-gated call is also undecided.
- **Documented conflict between docs.** The plan doc still lists Build as Blocked, while the later design doc says the product gate was "treated as cleared per user instruction." The plan's status table was never updated to reflect the design approval or the adapter being built. A resumer must reconcile these and decide which holds.
- **Unresolved go-decision inputs.** Unsized build-effort estimate; 4th-surface maintainer/ownership; Figma Community publishing/review process; i18n plan; iframe-specific a11y plan; explicit FigJam scope decision.
- **Open implementation decisions** (must be locked before networked flows):
  - Fill primitive: `node.characters` vs `insertCharacters`.
  - `domFingerprint` input: name-path vs `node.id` ("Resolve before build") — this is the cross-surface persona moat; saved-mapping matches can silently miss after renaming an ancestor frame/layer or duplicating the file.
  - Variant-components-as-select; `clientStorage` quota/chunking; prod API domain + plugin-id placeholders.
- **Realm-split correctness.** `code.ts` must install its own dispatcher (not call `mountSandboxBridge()`) so a network message can be added; the adapter is intentionally left untouched. The iframe may be unmounted by Figma on panel close, which complicates auth/session lifecycle.
- **Adapter v1 scope limits** (intentional, but real for any consumer expecting full coverage): only TEXT nodes scanned/filled; only `nativeInput` fill strategy honored; mixed-font nodes skipped rather than written; no `assisted` outcome.
- **Adapter package-config gap.** No `build`/`lint` script; ambient `figma-env.d.ts` instead of `@figma/plugin-typings`; `FigmaNodeRef` exported but unused. Fine for an internal workspace package, but not independently buildable/publishable as-is.
- **Cross-realm input not Zod-validated.** `bridge.ts` uses structural type-guards rather than parsing inbound sandbox↔iframe messages, despite the repo convention to parse untrusted cross-realm input; only the selection-scope crossing is schema-backed.
- **Concurrent-git note.** The figma-adapter package appears to have been committed by a separate session; per the concurrent-git convention, future app-scaffold work should stage only its own files.

## How to resume

Work from `docs/superpowers/specs/2026-05-30-figma-plugin-design.md` (the approved scaffold design). Suggested order:

1. **Reconcile the gate first.** Decide whether the product user-base GO is actually cleared. Update `docs/FIGMA_PLUGIN_PLAN.md`'s status table to match reality (adapter built, design approved) and resolve the plan-vs-design conflict before any build work.
2. **Lock the open implementation decisions** named in `docs/FIGMA_ADAPTER_SCOPE.md` and design-doc §12 — especially `domFingerprint` input (name-path vs `node.id`) and the fill primitive — since these gate networked flows and persona stability.
3. **Scaffold `apps/figma-plugin`** per the design spec: create the directory (it auto-registers via `pnpm-workspace.yaml`'s `apps/*`), add `manifest.json` (editorType `['figma']`, `main`, `ui`, `networkAccess`), `tsconfig.code`/`tsconfig.ui`, and the two Vite configs (`vite.config.code.ts` IIFE + `vite.config.ui.ts` single-file). Swap the adapter's `figma-env.d.ts` for `@figma/plugin-typings` and add `@quikfill/figma-adapter` as a dependency. (Build sequence Phase 1: skeleton.)
4. **Wire the bridge + transports** (Phase 2): write `code.ts` with its own dispatcher built from the adapter's exported guards (do **not** call `mountSandboxBridge()`), and add the network message + both transports (`figma.fetch`-via-bridge default, iframe-fetch behind `QF_NET`) with bridged `Response` reconstruction.
5. **Port networking + auth** (Phase 3): bring api-client/auth into the iframe realm over bridged storage; mirror `browser-adapter` auth and the `useAuthGate` FSM + OTP components.
6. **Port the session orchestrator** (Phase 4): `useFigmaFillSession` from `lib/useFillSession.ts`, plus sidepanel/auth Vue components reusing `@quikfill/ui`.
7. **Parity tail + polish/gate** (Phases 5–6): profile sync, fill-run recording, a11y/i18n, and re-assert `domFingerprint` stability under benign edits.
8. **Backfill adapter tests** for the untested paths before relying on them: bridge undo/storage round-trips, `clearStaleMarkers`, the `qf-id` marker fallback, locked-node and duplicate-claim skips; add coverage for component-instance text writability.
9. **Verify in a real Figma runtime** (Import via Plugins → Development → Import), then resolve packaging placeholders (prod API domain, plugin id) and proceed to Figma Community submission.
