# Shared Packages — Implementation Plan

The packages are the **browser-agnostic engine** the Chrome extension and the
dashboard share. This document specifies each package's responsibilities, public
surface, dependency rules, and tests. Parent roadmap:
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

> **Why this matters:** the requirement is explicit that DOM/Chrome logic must
> stay out of `autofill-core`, and that all cross-package + AI contracts go
> through schemas. These boundaries are what let the extension be the first
> surface while the app reuses the exact same engine and data model later.

## Dependency rules (enforced)

```txt
schemas        → (no deps) pure Zod + inferred types
generators     → schemas
autofill-core  → schemas, generators            ❌ no DOM, Chrome, Vue, Nuxt, backend
form-scanner   → schemas                          ✅ DOM   ❌ Chrome, Vue
browser-adapter→ schemas                          ✅ chrome.* (the ONLY package that may)
ai             → schemas                          ❌ no API key, no network to Gemini
api-client     → schemas                          ✅ fetch/axios to quikfill-services
ui             → (Vue + tailwind + shadcn-vue)    consumed by app + extension UI
config         → (no runtime deps)                eslint/tailwind/tsconfig/test presets
```

A lint boundary rule (e.g. `eslint-plugin-import` `no-restricted-paths`) should
fail the build if `autofill-core` imports `form-scanner`, `browser-adapter`,
`vue`, or `chrome`.

---

## `packages/schemas` — canonical contracts (Iteration 2)

Shared Zod schemas + inferred TS types. **Single source of truth** for every
cross-package and AI contract. Align names 1:1 with the backend's _Contracts
Appendix_ (`quikfill-services/docs/IMPLEMENTATION_PLAN.md`).

**Schemas to define** (each with `z.infer` type export and a parse test):

| Schema                              | Notes / key fields                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserAccount`                       | id, email, createdAt (implicit local account allowed pre-auth)                                                                                                                                                                                                                                   |
| `Domain`                            | id, name, hostnames[], description                                                                                                                                                                                                                                                               |
| `FormProfile`                       | hostname, urlPatterns[], pageTitlePatterns[], `fieldFingerprintHash`, `structureMetadata` (section headings, field count, structure hash), name                                                                                                                                                  |
| `DetectedField`                     | scanner id, tag, inputType, currentValue, required, disabled/readonly, visibility, name, id, classNames, placeholder, autocomplete, aria label + labelledby text, associated label, nearbyText, sectionHeading, options[], selectorCandidates[], `domFingerprint`, frame context, shadow context |
| `FieldFingerprint`                  | stable hash inputs (label/name/type/options/section) + the hash                                                                                                                                                                                                                                  |
| `FieldMapping`                      | fieldFingerprint, selectorCandidates, semanticHints, `target`, `fillSource`, `fillStrategy`, confidence, lastSuccessfulFillAt                                                                                                                                                                    |
| `FillSource`                        | **discriminated union** on `sourceType` — see below                                                                                                                                                                                                                                              |
| `FillPlanItem`                      | detectedFieldId, label, currentValue, proposedValue, fillSource, confidence, fillStrategy, warnings[], `requiresConfirmation`                                                                                                                                                                    |
| `FillPlan`                          | items[], profile match info, mode                                                                                                                                                                                                                                                                |
| `FillResult`                        | per-field: status (success/skipped/failed), accepted value, reason                                                                                                                                                                                                                               |
| `FillRun`                           | user, domain, formProfile?, url, mode, planItems (redacted), results, failedFields, undoSnapshot?, timestamp                                                                                                                                                                                     |
| `EntityType` / `EntityFieldDef`     | `EntityFieldDef`: `{ key, label, type, required, options? }`; type ∈ text\|number\|boolean\|date\|email\|phone\|enum\|address\|currency\|notes                                                                                                                                                   |
| `EntityRecord`                      | entityTypeId, name, values keyed by field key                                                                                                                                                                                                                                                    |
| `GeneratorPreset` / `GeneratorRule` | rule: `{ fieldKey, kind, options }`; kind ∈ person\|email\|phone\|address\|company\|url\|unit\|number\|date\|currency\|boolean\|notes\|selectOption\|customEnum                                                                                                                                  |
| `FieldSummary`                      | AI input — minimized + redacted: fieldId, label, inputType, autocomplete, options[], nearbyText, sectionHeading. **No current value, no HTML.**                                                                                                                                                  |
| `AiSuggestion`                      | AI output — untrusted: fieldId, semanticType, confidence (0–1), reasons[]                                                                                                                                                                                                                        |
| `StorageAdapter` / `SyncAdapter`    | TS interfaces (below), co-located here                                                                                                                                                                                                                                                           |

**`FillSource` union** (mirror backend exactly):

```ts
| { sourceType: 'recordField'; entityTypeId: string; recordId?: string; fieldKey: string }
| { sourceType: 'generatorRule'; presetId?: string; ruleKey: string }
| { sourceType: 'staticValue'; value: string }
| { sourceType: 'runtimeValue'; promptLabel: string }
| { sourceType: 'aiGenerated'; hint: string }
| { sourceType: 'composed'; template: string; parts: FillSource[] }
```

**Adapter contracts** (interfaces only — implementations live elsewhere):

```ts
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}
interface SyncAdapter {
  snapshot(since?: string): Promise<SyncSnapshot> // GET /sync/snapshot
  push(changes: SyncChange[]): Promise<void> // POST /sync/push (idempotent by id)
}
```

**Tests:** parse round-trips, discriminated-union rejection of bad `sourceType`,
required-field enforcement, fingerprint determinism.

**Exit:** extension and dashboard both import the same contracts.

---

## `packages/autofill-core` — planner & matcher (Iterations 4, 6)

Browser-agnostic planning and matching. **No DOM, Chrome, Vue, Nuxt, or backend.**

**Responsibilities**

- Normalize scanner output (`DetectedField[]`) into planning input.
- **Heuristic classification** of obvious fields (email/phone/name/etc.) from
  label/name/autocomplete/aria/placeholder — deterministic, before any AI.
- Match detected fields to saved `FieldMapping`s; **score mapping confidence**.
- Form-profile matching helper that mirrors the backend's v1 algorithm
  (hostname gate → urlPattern glob → pageTitle → fingerprint exact → field-count
  proximity → structure similarity; tie-break by `lastSuccessfulFillAt`).
  **Never URL-only.** Keep it pure and unit-tested.
- Resolve `FillSource`s into proposed values (calls into `generators`; record/
  static/runtime/AI/composed handled by type).
- Build `FillPlan`s with per-item warnings + `requiresConfirmation`.
- Identify unsupported fields and produce warnings.
- Prepare undo plans (capture previous values → reverse plan).

**Public surface (sketch):** `classifyFields`, `matchProfile`, `matchMappings`,
`scoreMapping`, `resolveFillSource`, `buildFillPlan`, `buildUndoPlan`.

**Tests:** classification on label fixtures; profile scoring (glob, fingerprint
match, tie-breaks); plan generation; undo-plan correctness. Highest-value unit
tests in the repo — keep coverage strong.

---

## `packages/form-scanner` — DOM scanning (Iteration 3)

DOM-aware. Runs inside the content script. **No Chrome, no Vue.**

**Responsibilities**

- Find inputs, textareas, selects, checkboxes, radios, contenteditable, and
  common custom controls (progressively).
- Extract everything `DetectedField` requires (labels, placeholder, name, id,
  autocomplete, ARIA text, nearby text, section heading, options, current value,
  visibility).
- Generate **selector candidates** (id → name → stable attrs → structural path),
  ranked by stability — not a single brittle CSS selector.
- Generate **field fingerprints** (stable hash over label/name/type/options/
  section) and a form **structure hash**.
- Detect same-origin iframes and **open** shadow DOM; report inaccessible fields
  (closed shadow, cross-origin) as limitations rather than failing silently.
- **Custom (non-native) dropdowns** (Iteration 9 follow-up): broad heuristic
  (`role=combobox` / `aria-haspopup=listbox` / `aria-expanded` trigger /
  `data-trigger=select`, guarded by a real option list) emits one
  `inputType: 'customSelect'` field per widget with a `customWidget` descriptor
  (trigger / value-display / option-item selectors). The widget's internal
  inputs are folded into it. `fill.ts` click-drives these (open → click option →
  verify displayed text), which is why `applyFill`/`applyUndo` are **async**.
- **Junk filtering:** fields with no human identity whose only id is a
  framework-generated value (`_r_…`, `:r…:`, MUI/emotion) are dropped.
- **Scope:** `scanForms(root)` accepts a `Document | Element`; `resolveScopeRoot`
  (in `scope.ts`, run by the content script) picks the best container —
  open dialog/drawer → focused/largest `<form>` → whole page — and the result
  carries a `scope` descriptor for the side panel's scope switcher. Scoping
  shrinks `structureHash` to the container's fields (more stable). Compat:
  whole-page profiles saved before this self-heal on next save (field mappings
  still resolve via per-field fingerprints); no migration.

**Tests:** Vitest + jsdom for extraction logic; **fixture HTML pages** (shared
with the extension E2E) for realistic DOM. Assert fingerprint stability across
benign DOM changes and uniqueness across distinct fields. `scope.test.ts` covers
container detection (dialog/drawer/form/page, stacked, hidden).

---

## `packages/browser-adapter` — Chrome integration (Iteration 3)

The **only** package allowed to touch `chrome.*`.

**Responsibilities**

- Extension messaging (typed `sendMessage`/`onMessage` wrappers over the
  [message protocol](./CHROME_EXTENSION_PLAN.md#message-protocol)).
- `chrome.storage` wrappers implementing `StorageAdapter` (local; avoid `sync`
  for sensitive data).
- Current-tab / frame targeting; permission checks (`activeTab`, host perms).
- Script injection (`chrome.scripting`) and runtime utilities.
- The local `StorageAdapter` implementation and a future `SyncAdapter` shim.

**Tests:** unit-test message (de)serialization and adapter logic with `chrome`
mocked. Real messaging is covered by the extension E2E harness.

---

## `packages/generators` — data generation (Iteration 4)

Random + deterministic generation. Depends only on `schemas`.

**Kinds:** person, email, phone, address, company, url, unit, number, date,
currency, boolean, notes, selectOption, customEnum.

**Features:** locale, **seed** (seeded mode → reproducible), constraints, format
options. `selectOption` picks from a field's detected options; `customEnum` from
a user-provided list.

**Tests:** seeded determinism (same seed → same output); locale/format/constraint
honoring; `selectOption` only ever returns a valid option.

---

## `packages/ai` — Gemini-facing contracts & privacy (Iteration 7)

Frontend AI helpers + contracts. **No API key. No direct Gemini network call.**

**Responsibilities**

- Build privacy-aware `FieldSummary[]` from `DetectedField[]`: **redact current
  values by default**, strip HTML, cap size.
- Call backend `POST /ai/classify-fields` / `/ai/suggest-mappings` via
  `api-client` (production path).
- **Validate every AI response** against `AiSuggestion` (Zod) before use; treat
  output as untrusted suggestions.
- Convert suggestions into reviewable mapping proposals (accept/reject), never
  auto-applied.

**Tests:** summary builder redacts values + rejects oversized/HTML payloads;
response validator rejects malformed AI output; suggestion→proposal mapping.

---

## `packages/api-client` — typed backend client (Iteration 10, stubs earlier)

Typed client for `quikfill-services`. No product-decision logic.

**Responsibilities**

- Fetch/axios wrapper with auth header policy + cancellable requests (mirror
  `vue3-template`'s axios setup and queued-401-refresh interceptor).
- Endpoints: auth (magic link/verify/refresh/me), entity types/records, generator
  presets, domains, form profiles + `match`, field mappings, fill runs, sync
  (`snapshot`/`push`), AI (`classify-fields`/`suggest-mappings`), subscription +
  entitlements.
- Prefer an OpenAPI-generated client from the backend's `openapi.json` when
  stable; otherwise typed manual endpoints. Parse responses with `schemas`.

**Tests:** request shaping, auth header, 401-refresh queue, response parsing
against `schemas` (mocked transport).

---

## `packages/ui` — shared Vue components (Iterations 3+/8)

shadcn-vue primitives + reusable app components shared by the dashboard and the
extension side panel, imported as `@quikfill/ui/<component>`. Provides `cn()` and
the Tailwind v4 preset. Keep components **operational** (dense, productivity-tool
feel) — do **not** couple website marketing design here.

---

## `packages/config` — shared config (Iteration 1)

Shared, versioned presets so apps don't drift:

- TypeScript base (`tsconfig.base.json`).
- ESLint 9 flat config base (re-exported by the root `eslint.config.js`).
- Tailwind v4 preset + semantic tokens.
- Vitest base setup.

---

## Build sequencing of packages

| Iteration | Packages touched                                                            |
| --------- | --------------------------------------------------------------------------- |
| 1         | `config`, `ui` (scaffold), all others placeholder                           |
| 2         | `schemas` (full), adapter interfaces                                        |
| 3         | `form-scanner`, `browser-adapter`                                           |
| 4         | `generators`, `autofill-core` (classify + plan)                             |
| 6         | `autofill-core` (profile match + undo), `browser-adapter` (profile storage) |
| 7         | `ai`, `api-client` (AI endpoints)                                           |
| 10        | `api-client` (full), `browser-adapter` (`SyncAdapter`)                      |
