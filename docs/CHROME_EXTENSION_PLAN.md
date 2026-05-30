# Chrome Extension — Implementation Plan (Primary Surface)

`apps/chrome-extension` is the **core product experience**: it scans a page,
detects fields, matches saved profiles, optionally asks Gemini for help, builds a
previewable fill plan, fills fields, verifies results, supports undo, and saves
form profiles. This is the deepest of the surface plans because it is built
first. Parent roadmap: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
Engine spec: [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md).

> **North star:** local-first, production-shaped. The extension composes the
> shared packages; it does not reimplement scanning, planning, generation, or
> contracts. Chrome-specific code lives only in `browser-adapter` and the
> extension's own entrypoints.

## Status

| #   | Iteration                                                  | Status  |
| --- | ---------------------------------------------------------- | ------- |
| 3   | Scanner prototype (scan + inspect detected fields)         | ✅ Done |
| 4   | Fill plan preview (generators + heuristics + preview UI)   | ✅ Done |
| 5   | Fill execution + undo (native fill, verify, undo, results) | ✅ Done |
| 6   | Local form profiles (save/match/reuse mappings)            | ✅ Done |
| 7   | Gemini assistance (privacy-aware AI, review/accept/reject) | ✅ Done |
| —   | UI design-system pass (popup / side panel / options)       | ✅ Done |

(Iterations 1–2 — monorepo + schemas — are tracked in the master plan and are
prerequisites for everything below.)

> **UI design-system pass (post-Iteration 8):** the popup, side panel, and options
> page were rebuilt against the shared design system (the `packages/config/theme.css`
> tokens and `@quikfill/ui`) to match the dashboard, with no change to the
> scan/fill/undo/profile/AI behaviour — a `useFillSession` composable wraps the
> existing package calls. Added shared primitives: a `Switch` in `@quikfill/ui` and
> an `ExtensionSettings` schema (`@quikfill/schemas`) backing a local-first settings
> store. Still local-first — backend wiring stays in Iteration 10.

---

## Build tool decision: WXT

**Decision:** build the extension with **[WXT](https://wxt.dev)** + Vue 3 + Vite

- Tailwind v4. Alternative considered: **CRXJS**. WXT is recommended because it
  is MV3-native, gives file-based entrypoints, generates the manifest from config,
  provides typed messaging + `storage` helpers, and has working HMR for the side
  panel and content scripts. CRXJS is a fine lighter-weight Vite plugin but leaves
  more manifest/wiring manual. Either keeps us on Vite, so the decision is
  reversible without changing feature code (which lives in the shared packages).

> **CSP / Vue note (the "can you even use a framework?" concern):** MV3's CSP
> forbids remotely-hosted code and runtime `eval`/`new Function()`. Vue's
> **runtime template compiler** uses `new Function()`, which would violate CSP —
> but with WXT + Vite + **Single-File Components**, templates are **precompiled
> at build time** and we ship the runtime-only build. No eval, no CSP violation.
> Frameworks are fully supported; only the old "load a framework from a CDN at
> runtime" pattern is dead. Keep all code bundled; never inject remote scripts.

---

## MV3 architecture

```txt
┌─────────────────┐  user clicks QuikFill         ┌────────────────────────────┐
│  side_panel     │ ◀───────────────────────────▶ │  service_worker (background)│
│  (Vue 3 — the   │     typed messages            │  - routing/orchestration    │
│   primary UI)   │                               │  - chrome.storage (adapter) │
│  scan/plan/fill │                               │  - backend (api-client)     │
│  preview/undo   │                               │  - AI mediation calls       │
└────────┬────────┘                               └─────────────┬──────────────┘
         │ messages (via browser-adapter)                       │ scripting.executeScript
         ▼                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  content_script (per tab/frame)                                                │
│   - form-scanner: detect fields → DetectedField[]                              │
│   - filler: apply FillPlan, dispatch events, verify, capture undo snapshot     │
│   - NO Vue, NO product decisions — just DOM in/out over the message protocol   │
└──────────────────────────────────────────────────────────────────────────────┘

popup       → lightweight: status + "Open side panel" + quick actions
options_page→ extension preferences (AI on/off, default fill source, locale, redaction)
```

**Responsibility split**

- **side_panel** — all primary UX and plan review. Composes `autofill-core`,
  `generators`, `ai` (via background), and `ui`.
- **service_worker** — stateless orchestrator: routes messages, owns storage and
  backend/AI calls (so secrets/tokens never sit in a content script), holds no
  long-lived in-memory state (MV3 workers are killed; persist to storage).
- **content_script** — thin DOM agent: runs `form-scanner` and the filler;
  returns structured data; never decides values.
- **popup** — minimal; nudges to the side panel.
- **options_page** — preferences only.

**Permissions (minimal):** `sidePanel`, `scripting`, `storage`, `activeTab`, and
host permissions requested **on user action** — not broad `<all_urls>` at install
where avoidable. `tabs` only if a feature truly needs it. Document every
permission's justification in the manifest config (Web Store review needs it).

---

## Message protocol

Typed messages flow through `browser-adapter`; payloads validated against
`packages/schemas`. Core message set (extend per iteration):

| Message         | Direction                | Payload                                                     | Response                          |
| --------------- | ------------------------ | ----------------------------------------------------------- | --------------------------------- |
| `SCAN_REQUEST`  | panel → worker → content | `{ options }`                                               | `DetectedField[]` (+ limitations) |
| `MATCH_PROFILE` | panel → worker           | `{ hostname, url, pageTitle, fingerprintHash, fieldCount }` | ranked profile candidates         |
| `BUILD_PLAN`    | panel (local)            | `{ detectedFields, mappings, fillSourceChoice }`            | `FillPlan`                        |
| `AI_CLASSIFY`   | panel → worker → backend | `FieldSummary[]`                                            | `AiSuggestion[]` (validated)      |
| `FILL_REQUEST`  | panel → worker → content | `FillPlan`                                                  | `FillResult[]` (+ undo snapshot)  |
| `UNDO_REQUEST`  | panel → worker → content | `{ undoSnapshot }`                                          | `FillResult[]`                    |
| `SAVE_PROFILE`  | panel → worker           | `{ FormProfile, FieldMapping[] }`                           | `{ profileId }`                   |

Rules: every payload is a schema-validated type; the content script trusts
nothing it isn't given; the worker is the only hop that talks to storage/backend.

---

## Primary product flow (target)

1. User opens any third-party form.
2. User opens the QuikFill **side panel**.
3. Extension requests current-tab access if needed (`activeTab` on click).
4. User clicks **Scan** → `SCAN_REQUEST`.
5. Content script (`form-scanner`) returns `DetectedField[]` + limitations.
6. Panel asks worker to **match saved profiles** for the domain/page/fingerprint.
7. **Saved mappings applied first.**
8. **Heuristics** (`autofill-core.classifyFields`) classify obvious fields.
9. **Gemini** (optional, user-initiated) classifies ambiguous fields → validated
   `AiSuggestion[]` the user can accept/reject.
10. User picks a **fill source**: generator preset / saved record / static
    template / hybrid / AI-assisted.
11. `autofill-core.buildFillPlan` produces a **preview** `FillPlan`.
12. User reviews each item: current value, proposed value, source, confidence,
    warnings, and whether confirmation is required.
13. User clicks **Fill** → `FILL_REQUEST`.
14. Content script fills fields + dispatches `input`/`change`/`blur`.
15. Extension **verifies** accepted values and shows per-field success/failure.
16. User can **undo** the most recent fill where possible.
17. User can **save/update** the form profile for reuse.

---

## Fill execution requirements

The filler (content script) must:

- Use **native value setters** for inputs/textareas
  (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set`)
  so framework-controlled (React/Vue/Angular) inputs register the change.
- Dispatch `input`, `change`, and `blur` (bubbling) after setting.
- Use **click** behavior for checkboxes/radios; set + dispatch for native
  `<select>`.
- **Verify** the accepted value after dispatch; report mismatch as a failure.
- **Capture previous values** before writing → undo snapshot.
- **Skip** disabled/readonly/hidden/unsupported fields unless explicitly allowed,
  and report why.
- Return **structured per-field results** (`FillResult[]`), never throw on a
  single bad field.

---

## Field support levels (honest about browser limits)

| Level                     | Scope                                                                          | When                                |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| 1 — Native                | inputs, textareas, selects, checkboxes, radios                                 | Iteration 5 (required)              |
| 2 — Framework-controlled  | React/Vue/Angular controlled inputs (native setter + events)                   | Iteration 5, immediately after      |
| 3 — Custom components     | React Select, MUI Select/Autocomplete, Ant Select, date pickers, masked inputs | incrementally post-MVP              |
| 4 — Hard boundaries       | same-origin iframes, open shadow DOM, cross-origin iframes (with perms)        | where possible                      |
| 5 — Not reliably fillable | closed shadow DOM, canvas forms, hostile/injection-blocked pages               | **detect + explain**, never pretend |

The scanner + filler must surface Level 5 cases as clear limitations in the UI.

---

## Iteration detail

### Iteration 3 — Scanner prototype

**Build:** MV3 extension shell (WXT), side panel UI, worker↔content messaging,
`form-scanner` native-field scanning, detected-field list UI in the panel.
**Packages:** `form-scanner`, `browser-adapter`, `ui`.
**UI:** Scan button → list of detected fields with label, type, current value,
visibility, and any limitations.
**Tests:** scanner extraction (jsdom + fixtures); messaging round-trip (mocked
chrome); E2E: load extension, open panel, scan a fixture page, see fields.
**Exit:** user can scan a real page and inspect detected fields.

### Iteration 4 — Fill plan preview

**Build:** `generators` (the catalog), `autofill-core` heuristics + `buildFillPlan`,
fill-source picker, preview UI. **No writing to the page yet.**
**UI:** per-field row showing current value, proposed value, source, confidence,
warnings; toggle include/exclude; choose source per field or in bulk.
**Tests:** classification on label fixtures; generator determinism (seeded); plan
generation; preview renders all item fields.
**Exit:** user can generate a preview plan without filling.

### Iteration 5 — Fill execution + undo

**Build:** filler (native setters + event dispatch), verification, undo snapshot,
structured `FillResult[]`. Levels 1–2.
**UI:** Fill button; per-field success/skip/fail with reasons; Undo button.
**Tests:** filler against fixture pages incl. a framework-controlled input
fixture; verification catches rejected values; undo restores prior values; E2E:
scan → preview → fill → verify → undo on a fixture form.
**Exit:** user can preview, fill, verify, and undo on native forms.

### Iteration 6 — Local form profiles

**Build:** save `Domain`/`FormProfile` + `FieldMapping[]` to `chrome.storage`
(local, via `StorageAdapter`); `autofill-core.matchProfile` (hostname →
urlPattern → pageTitle → fingerprint → field-count → structure; tie-break by
`lastSuccessfulFillAt`); apply saved mappings first on scan; update mappings on
successful fill (bump `lastSuccessfulFillAt`/confidence).
**Tests:** matching/scoring (globs, fingerprint exact, tie-breaks); save/load
round-trip; "scan a known page → mappings pre-applied".
**Exit:** user can reuse a saved form profile.

### Iteration 7 — Gemini assistance

**Build:** `ai` field-summary builder (redacted, no HTML), backend AI client via
`api-client` (`POST /ai/classify-fields`, `/ai/suggest-mappings`), `AiSuggestion`
validation, review/accept/reject UI. AI is **user-initiated** and tied to a click.
**Privacy:** never send current values or full HTML; no key in the bundle; all
calls mediated by `quikfill-services`; all responses schema-validated and treated
as untrusted.
**UI:** "Ask QuikFill AI" on ambiguous fields → suggested semantic type / source
with reasons + confidence → accept (writes a mapping) or reject.
**Tests:** summary redaction + size guard; response validator rejects malformed
output; accepted suggestion produces a valid `FieldMapping`.
**Exit:** user can use Gemini to classify ambiguous fields and improve mappings.
✅ Met — `@quikfill/ai` builds redacted, HTML-stripped, size-capped field
summaries (current values never leave the page), validates untrusted AI output,
and turns an accepted suggestion into a reviewable proposal (reusing
`generatorRuleForSemanticType`). `@quikfill/api-client` posts to
`/ai/classify-fields` and `/ai/suggest-mappings` (transport-injectable, schema-
validated). `browser-adapter` adds the `AI_CLASSIFY` panel→background message;
the background worker owns the api-client call. The side panel surfaces "Ask
QuikFill AI" on ambiguous fields with accept/reject and fails gracefully when
the backend is unavailable. Unit tests cover redaction/leak-proofing, the
response validator, the proposal mapping, the typed client, and the message.
Also wired as a **per-field** source: cycling a field's source pill to AI runs
an on-demand single-field classify and resolves it through the same proposal
path (generator-backed value when the semantic type maps; honest "couldn't
determine" copy otherwise) — see
[`docs/superpowers/specs/2026-05-30-per-field-ai-source-design.md`](./superpowers/specs/2026-05-30-per-field-ai-source-design.md).

---

## Local storage layout (local-first)

Behind `StorageAdapter` (keys namespaced; never `chrome.storage.sync` for
sensitive data):

- implicit local account/profile
- saved domains, form profiles, field mappings
- generator presets
- most-recent scan (for re-open without re-scan)
- undo snapshot (latest fill)
- extension preferences (AI on/off, default source, locale, redaction)

When the backend's sync iteration is ready, swap the local `StorageAdapter` for a
sync-backed one (last-write-wins by `updatedAt`, client UUIDs) — feature code
unchanged.

---

## Testing

- **Unit (Vitest):** scanner extraction, fingerprinting, classification, profile
  matching, generators, plan builder, AI summary/validation, message
  (de)serialization.
- **Fixture HTML pages:** shared with `form-scanner`/`autofill-core` tests; cover
  native fields, a framework-controlled input, an open-shadow-DOM field, and a
  Level-5 "cannot fill" case.
- **E2E (Playwright extension harness):** load the unpacked extension, drive the
  side panel through scan → preview → fill → verify → undo → save against the
  fixtures.

## Guardrails (do not regress)

- DOM/Chrome code stays in `content_script` + `browser-adapter`; planning logic
  stays in `autofill-core`.
- Never URL-only form identity. Never hard-code a single site.
- AI is review-first and never fills the page. Minimal permissions. Bundled code
  only (MV3 CSP).
