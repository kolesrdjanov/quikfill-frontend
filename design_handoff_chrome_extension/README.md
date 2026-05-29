# Handoff: QuikFill Chrome Extension — Side Panel, Popup & Options

## Overview

QuikFill is a privacy-first form-autofill Chrome extension (MV3). The user opens a
**side panel**, scans the current page, the extension detects fields, matches a saved
profile, optionally asks AI to classify ambiguous fields, builds a **previewable fill
plan**, fills the page (native value setters + dispatched events), verifies each field,
supports **undo**, and lets the user **save/update a reusable form profile**.

This handoff covers the three extension surfaces:
- **Side panel** — the primary UI and the whole flow (the hero).
- **Popup** — a lightweight toolbar launcher.
- **Options page** — extension preferences.

---

## About the Design Files

The files in `prototype/` are a **design reference built in plain HTML/CSS/JS** — a
clickable prototype showing the intended look, states, and behaviour. **They are not
production code to copy.** The HTML uses a hand-rolled `state` object + string-template
rendering purely to make the prototype interactive; do **not** port that pattern.

Open `prototype/chrome-extension-prototype.html` in a browser to click through it. It has
three host-page scenarios (chips at the top) that exercise every state below.

**Your task:** recreate these designs inside the **existing** extension app at
`apps/chrome-extension` (WXT + **Vue 3** + Vite + Tailwind v4), composing the **already-built**
shared packages. The data model, message protocol, planning engine, generators, AI client,
and stores **already exist** — this is a **UI implementation** job: replace the bare-bones
`sidepanel/App.vue`, `popup/App.vue`, and `options/App.vue` with the designed UI and wire
them to the real packages. Match the prototype closely, but express it in Vue SFCs +
Tailwind + the `@quikfill/ui` component library, **not** the prototype's CSS classes.

> MV3 CSP reminder (already handled by WXT): all code is bundled, templates are precompiled,
> no remote scripts, no `eval`. Don't introduce runtime-compiled templates or CDN scripts.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, component styling, copy, and
interaction states are all specified here and in the prototype. Recreate the UI faithfully
using the codebase's existing Tailwind tokens (`packages/config/theme.css`) and `@quikfill/ui`
primitives. The prototype's `theme.css` / `components.css` are included so you can lift exact
hex/spacing values, but the production styling must go through Tailwind + shadcn-vue patterns
already in the repo.

---

## How the prototype maps to the real codebase

Everything the UI needs already exists. Bind to these — do not reinvent:

| UI concern | Use (already in repo) |
| --- | --- |
| Scan the page | `requestScan(tabId)` → `ScanResult { fields: DetectedField[], limitations, structureHash }` (`@quikfill/browser-adapter`) |
| Match a saved profile | `matchProfiles(...)`, `matchMappings(...)` (`@quikfill/autofill-core`) + `createProfileStore(createChromeStorageAdapter())` |
| Heuristic classify | `classifyFields(fields)` → `FieldClassification[]` (`@quikfill/autofill-core`) |
| Ambiguous fields | classification `semanticType === 'unknown' \|\| confidence < 0.6` |
| Ask AI | `requestAiClassify(buildFieldSummaries(ambiguous))` → `AiSuggestion[]`; `suggestionToProposal()` (`@quikfill/ai`) |
| Build preview plan | `buildPreviewPlan(fields, { seed, savedMappings })` / `buildFillPlan(...)` → `FillPlanItem[]` |
| Fill the page | `requestFill(tabId, FillInstruction[])` → `{ results: FillResult[], undoSnapshot }` |
| Undo | `requestUndo(tabId, undoSnapshot)` |
| Save / update profile | `store.saveDomain / saveFormProfile / saveMapping / touchMapping` |
| Records & generators ("My data") | `EntityType` / `EntityRecord` / `GeneratorPreset` schemas (`@quikfill/schemas`) |

The current `sidepanel/App.vue` already wires this with unstyled markup — **treat it as the
behavioural contract** and restyle/restructure it to the design. Don't change the package
APIs; only the presentation. Confirm exact signatures against the source before relying on the
table above.

### Key schema types (from `@quikfill/schemas`)

- **`DetectedField`**: `{ id, tagName, inputType, currentValue?, required, disabled, readonly, visible, name?, labelText?, placeholder?, options?: {value,label}[], selectorCandidates, domFingerprint, frame, shadow }`
- **`FillPlanItem`**: `{ detectedFieldId, label, currentValue?, proposedValue, fillSource, fillStrategy, confidence (0–1), warnings: string[], requiresConfirmation }`
- **`FillSource.sourceType`** (discriminated union): `recordField | generatorRule | staticValue | runtimeValue | aiGenerated | composed`
- **`FillStrategy`**: `nativeInput | select | clickToggle | customSelect`
- **`FillResult`**: `{ detectedFieldId, status: 'success'|'skipped'|'failed', acceptedValue?, reason? }`
- **`ScanLimitation`**: `{ kind: 'closedShadow'|'crossOriginFrame'|'inaccessible', detail }`
- **`AiSuggestion`**: `{ fieldId, semanticType, confidence, reasons: string[] }`
- **`GeneratorKind`**: `person | email | phone | address | company | unit | number | date | currency | boolean | notes | selectOption | customEnum`

---

## Surfaces / Views

### 1) SIDE PANEL (primary) — 384px wide, full viewport height

A single panel with three fixed regions: **header**, scrollable **body**, **footer**.

- **Header** (`border-bottom`, `background: card`, padding `13px 15px`):
  - Brand lockup: 22px logo icon + "Quik**Fill**" (the "Fill" in `--primary`), weight 800, 15px, `letter-spacing: -0.02em`.
  - Right icon buttons (30×30, 8px radius, ghost hover `--muted`): **hide/show values** (`eye` / `eye-off`), **settings** (`settings` → opens options), **close** (`x`).
  - Below: a "site chip" row — 16px rounded favicon square (primary bg, white initial), monospace hostname in `--foreground`, then ` · N fields`/context in `--muted-foreground`, 12px.
- **Body**: `flex: 1; overflow-y: auto; padding: 14px; display:flex; flex-direction:column; gap: 11px`. Content depends on phase (below).
- **Footer**: `border-top; background: card; padding: 12px 14px; gap: 8px`. The primary action(s) for the phase, full-width.

#### Phase state machine

`prescan → scanning → detected → (AI review inline) → preview → filling → results`
Plus a persistent **matched-profile** banner and an optional **limitations** disclosure.

**A. Pre-scan (empty state)**
- Centered: 72×72 rounded-22px tile (`--primary-soft` bg, `--primary` icon) with `scan-line` (32px); H3 "Scan this page" (16.5px/700); muted paragraph "Detect every field, then preview a fill plan before anything is written." (13px, max 250px).
- Info alert: if saved profiles exist → "You have **N saved profiles** for this domain." (`bookmark-check`); else "Nothing is read until you scan. Values stay on your device." (`shield-check`).
- Footer: primary block button **"Scan page"** (`scan-line`).

**B. Scanning / Filling (loading)**
- Same centered tile, icon `loader-2` spinning (1s linear). H3 "Scanning…" / "Filling…" + one-line description. Footer button disabled with spinner.

**C. Detected fields**
- Header meta: `N fields`.
- Banners (stack, in this order, when relevant):
  - Matched profile → success alert, `bookmark-check`: "**Matched "<name>".** N saved mappings applied · by fingerprint."
  - AI unavailable → warning alert, `cloud-off`: "Quikfill AI is unavailable — it's optional, you can still preview and fill."
  - Ambiguous → info alert, `wand-sparkles`: "**N fields are ambiguous.** Heuristics weren't confident — ask AI to classify."
  - After AI runs → centered privacy hint, `lock`: "Only redacted field summaries were sent — never your values."
- **Field cards** (per non-hidden field): card, 1px border, 11px radius, padding `11px 12px`.
  - Top row: label (`--foreground`, 13.5px/600) left; `inputType` in mono 11px `--body-2` right.
  - Chips (`gap:6px`, wrap): `empty`/`has value` (gray), `required` (danger), `N options` (info), `custom widget` (warning), `ambiguous` (warning).
  - **Inline AI suggestion** (when AI returned one): inset card, `--warning-soft` bg + warning border; header `wand-sparkles` "AI suggests **<semanticType>**" + right-aligned confidence %; bulleted `reasons`; buttons **Accept** (primary sm) / **Reject** (ghost sm). Accepted → green "AI mapped → <semanticType>"; rejected → muted "Suggestion dismissed".
- **Skipped fields**: muted cards (opacity .58), `skipped` gray chip + reason (e.g. "Hidden tracking field — skipped.").
- **Limitations disclosure** if any (component below).
- Footer: primary **"Preview fill"** (`list-checks`); secondary outline **"Ask QuikFill AI"** (`wand-sparkles`; only if ambiguous fields exist AND AI pref on; spinner + "Asking AI…" while loading).

**D. Preview plan**
- Header meta: "N of M included".
- Banners: matched-profile recap; if any field `requiresConfirmation` → warning alert, `shield-alert`: "**N fields need confirmation.** Review before you fill."
- Sub-row: "N of M included" + ghost **"Regenerate"** (`refresh-cw`) — re-rolls generator-sourced values with a new seed.
- **Plan cards** (per planned field):
  - Top row: include/exclude checkbox + label (left); **source pill** button (right) showing source short name (`Record`/`Generator`/`AI`/`Static`/`Ask me`) + `chevron-down` — clicking **cycles** the field's fill source.
  - Value row: `currentValue || "empty"` (muted) → `→` → **proposedValue** in a mono pill on `--primary-soft`.
  - Foot row: source badge + a **confidence meter** (bar; ≥0.85 success/green, <0.6 warning/amber, else primary) + `%` (tabular).
  - Warning chips (per `warnings[]`) with `triangle-alert`. If `requiresConfirmation` and included → amber line `shield-alert` "Needs your confirmation before submit".
  - Excluded cards are muted.
- Footer: primary **"Fill N fields"** (`check-check`, disabled if 0 included); then a row of: outline **"Save profile"/"Update profile"** (`bookmark`) + (if AI relevant) ghost **"Ask AI"**.

**E. Results**
- Top alert: success if all good (`check-check`, "N filled. Verified on the page.") or warning if any failed (`shield-alert`, "N filled · K failed · J skipped. Some custom widgets need a manual touch.").
- **Result cards** per field: status icon (success `check`/green, skipped `minus`/muted, failed `x`/danger) + label + status badge; success shows the filled value pill; failed/skipped show the reason line.
- Limitations disclosure; if saved → hint `bookmark-check` "Profile saved — next visit fills instantly."
- Footer: outline **"Undo last fill"** (`undo-2`) + soft **"Save profile"/"Profile saved ✓"** (`bookmark-check`).

#### Shared components used in the panel

- **Alert** (`qf-alert--info|success|warning|danger`): left icon (16px) + rich text, 12.5px, soft-tinted bg, 1px border, rounded.
- **Badge** (`qf-badge--primary|info|success|warning|danger|gray`): pill, optional leading icon.
- **Confidence meter**: thin track + filled bar colored by threshold.
- **Limitations disclosure**: dashed 1px border, rounded 10px. Toggle button: `triangle-alert` + "N scan limitations" + caret. Expanded rows: limitation icon (`shield-x` closedShadow / `square-arrow-out-up-right` crossOriginFrame / `ban` inaccessible) + bold kind label + muted `detail`.

#### Source pill cycle

Cycle order: `recordField → generatorRule → aiGenerated → staticValue → runtimeValue`. Source
display map (label / short / badge tone / icon):
`recordField` "Saved record"/Record/primary/`database`,
`generatorRule` "Generator"/Generator/info/`dices`,
`aiGenerated` "AI draft"/AI/warning/`wand-sparkles`,
`staticValue` "Static value"/Static/gray/`pin`,
`runtimeValue` "Ask me"/Ask me/gray/`message-square-text`,
`composed` "Composed"/Composed/primary/`blocks`.
Changing a source recomputes the proposed value/confidence via the planner; manual override
of an AI-mapped field clears the AI mapping.

---

### 2) POPUP (toolbar launcher) — 290px

- Header: brand lockup + a status badge ("Plan ready" success / "Idle" gray).
- Body: primary block button **"Open side panel"** (`panel-right-open`); divider; three list rows (icon + title + subtitle, hover `--muted`):
  - **Quick scan** (`scan-line`) "Detect fields on this page" → opens panel + scans.
  - **My data** (`database`) "1 record · 3 generators" → opens options/data.
  - **Settings** (`settings`) "Open options page" → opens options.
- Pop-in animation from top-right; closes on outside click.

---

### 3) OPTIONS PAGE — preferences (in the prototype it's a right-side drawer; in production it is the extension's standalone options page route)

Sections, each a card (1px border, 14px radius) of rows (title + subtitle left, control right):

- **Filling**
  - *Default fill source* — select: Hybrid (record → generator) / Saved record / Generator preset / Ask AI.
  - *Auto-match saved profiles* — switch. Subtitle: "Apply mappings on scan by fingerprint — never URL alone."
  - *Hide values by default* — switch.
- **AI assistance**
  - *QuikFill AI* — switch. "Send redacted field summaries to classify ambiguous fields."
  - *Locale* — select: English (US) / English (UK) / Srpski (RS). Drives value generators.
- **Appearance & permissions**
  - *Theme* — segmented Light / Auto / Dark.
  - *Host access* — read-only success badge `shield-check` "On click only".
- **Data**
  - *Saved profiles & records* — outline "Manage" (`external-link`).
  - *Clear all data* — danger "Clear" (`trash-2`).

Persist via the same storage adapter the stores use; theme writes the `dark` class (matches
the existing app's theme handling). All prefs already have homes in the extension's settings
store — wire to it rather than inventing new keys.

---

## Design Tokens & Assets

- **Tokens**: use `packages/config/theme.css` (the repo's source of truth). `prototype/theme.css`
  mirrors it — key vars: `--primary` (QuikFill blue `#3056d3`), `--primary-soft`, `--foreground`,
  `--muted-foreground`, `--card`, `--border`, `--surface`, `--qf-body`, `--qf-body-2`,
  `--qf-stroke`, success/warning/danger + their `-soft` tints, radii (`--radius-lg`,
  `--radius-full`), shadows (`--shadow-2/3/pop/focus`). Full light + dark sets.
- **Type**: display/UI font + mono font as defined by `--font-display` / `--font-mono` in the
  repo config (do not hardcode new families).
- **Icons**: the prototype uses Lucide names (listed throughout). Use the repo's existing icon
  component (lucide-vue-next or equivalent) — same names.
- **Logo**: `prototype/assets/logo-icon.svg` (already in the extension's `public/`-equivalent;
  reuse the existing asset).
- **Density/scale**: panel is 384px; min touch target 44px in host-page contexts; never render
  the user's field values below 12px.

---

## States & Edge Cases to cover

- **No saved profile** (fresh page): heuristics + identity record cover most; some fields
  ambiguous (need AI); an AI-generated long-text field is `requiresConfirmation`. Save creates a
  new profile.
- **Matched profile** (returning user): mappings pre-applied (matched **by fingerprint**, not
  URL) → straight to a confident preview. Password fields are **never auto-filled** (held back,
  excluded by default, confirmation warning). Custom `<select>` widgets need confirmation. Opt-in
  checkboxes excluded by default.
- **Hard page / limitations**: cross-origin iframe (e.g. Stripe) and closed shadow DOM are
  **not fillable** and surface as scan limitations; custom React combobox / custom date picker
  may **fail** on fill → a **partial** result; file inputs are **skipped** (browser security).
  Native fields still succeed.
- **AI unavailable**: degrade gracefully — AI is optional; preview/fill still work.
- **Hide values**: every proposed/filled value masked to `••••••••` until revealed.
- **Regenerate**: only generator-sourced values change; record/AI values stay.
- **Undo**: clears the fill via the undo snapshot and returns to preview.

The three prototype scenarios (Globex application / Northwind checkout / Vertex onboarding)
demonstrate these three cases respectively — use them as acceptance fixtures.

---

## Implementation Notes

- **Stack**: WXT + Vue 3 `<script setup>` SFCs + Tailwind v4 + shadcn-vue (`@quikfill/ui`).
  Build panel/popup/options as composed Vue components, not one big file. Keep each SFC small.
- **State**: use the existing Pinia/composable stores and message helpers. Model the phase
  machine as a small composable (`useFillSession`) over the real scan/plan/fill calls; don't
  re-implement planning, generation, classification, or messaging — they're in the packages.
- **The prototype's `ext-app.js` is a reference for behaviour and copy only** (state transitions,
  banner logic, source-cycle, regenerate, undo, masking). Read it to confirm intended flow, then
  implement idiomatically in Vue.
- **Accessibility**: buttons are real `<button>`s; checkboxes/switches are labelled; confidence
  meters need an accessible text equivalent (the `%`); keep focus order header → body → footer.
- **Verify against**: `apps/chrome-extension/entrypoints/sidepanel/App.vue` (behaviour contract),
  `packages/schemas/src/*` (types), `packages/autofill-core` (planning/classify/match),
  `packages/ai` (classify), `packages/browser-adapter` (scan/fill/undo).

---

## Suggested build order

1. Tokens/typography wired (confirm Tailwind theme renders QuikFill blue + dark mode).
2. Panel **shell** (header / body / footer regions, brand, site chip, icon buttons).
3. **Pre-scan + scanning** states → wire `requestScan`.
4. **Detected** state: field cards, chips, skipped cards, limitations disclosure.
5. **AI review** inline (accept/reject) → wire `requestAiClassify` + `suggestionToProposal`.
6. **Preview**: plan cards, source pill cycle, confidence meters, include/exclude, regenerate.
7. **Fill → results → undo** → wire `requestFill` / `requestUndo`, verify statuses.
8. **Save/update profile** → wire store.
9. **Popup** launcher.
10. **Options** page bound to settings store.
11. Run all three scenarios as acceptance checks; match prototype.

---

## Files in this handoff

```
design_handoff_chrome_extension/
├── README.md                          ← this file
└── prototype/
    ├── chrome-extension-prototype.html  ← open in a browser; clickable reference
    ├── ext-app.js                       ← behaviour/copy reference (do NOT port pattern)
    ├── ext-scenarios.js                 ← the 3 acceptance scenarios + display maps
    ├── theme.css                        ← token values (mirror of packages/config)
    ├── components.css                   ← component styling values to lift
    └── assets/logo-icon.svg             ← logo (reuse existing repo asset)
```
