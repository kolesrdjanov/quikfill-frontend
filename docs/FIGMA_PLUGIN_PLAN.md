# Figma Plugin — Research & Requirements Brief (Exploratory)

> ⏸️ **ON HOLD (paused 2026-05-30).** This project is paused. For the authoritative
> done/missing status, see [`FIGMA_PLUGIN_STATUS.md`](./FIGMA_PLUGIN_STATUS.md). The
> brief below is preserved as-is and its status table was never updated for the
> adapter build or the scaffold-design approval — trust the status doc on state.

> **This is a requirements/research brief, not an approved iteration.** It captures
> a feasibility investigation into whether QuikFill can serve a Figma use-case, the
> honest competitive read, and a de-risking spike to run **before** committing to a
> build. Parent roadmap: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
> Engine spec: [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md). Sibling
> surface for comparison: [`CHROME_EXTENSION_PLAN.md`](./CHROME_EXTENSION_PLAN.md).

> **North star:** if we build this, it is a **fourth surface** (`apps/figma-plugin`)
> that **composes the existing shared packages** like the extension does. It does
> **not** reimplement classification, planning, generation, or contracts.
> Figma-API-specific code is isolated in a new host adapter, mirroring how
> `form-scanner`/`browser-adapter` isolate the web/Chrome specifics. "Compose" here
> means **reuse without source edits**, _not_ "drop in unchanged" — every package is
> source-only TypeScript and must still be **re-bundled, placed by runtime realm,
> and wired to a network transport** (see [Where each piece runs](#where-each-piece-runs-realm-split)).

## Status

| #   | Item                                                            | Status                                                                                                                                                                        |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Feasibility research (architecture + competitive scan)          | ✅ Done                                                                                                                                                                       |
| R1b | Audit of this brief against the real codebase + live Figma docs | ✅ Done (2026-05-30)                                                                                                                                                          |
| R2  | **Decision-gate** (classification quality on layer names)       | ✅ Done — two-tier gate: **forms 93% recall / 93% type-precision (GO-for-forms)**, dashboards 44% (out of v1 scope). Fixtures: `figma-r2-corpus.ts` + `figma-r2-gate.test.ts` |
| —   | Build (only if R2 passes the gate — see "Decision gate")        | 🔒 Blocked on the **product user-base check** (the classifier bar is cleared)                                                                                                 |

---

## The request (original use-case)

> A designer wants to fill Figma text layers with realistic boilerplate — names,
> emails, lorem ipsum, product copy — instead of typing it by hand. Does QuikFill
> fit this use-case, and can the Chrome extension work in Figma?

## Key finding: the extension cannot run inside Figma

QuikFill's web engine (`form-scanner`) is **pure DOM manipulation** — it walks the
page with `querySelectorAll`, identifies `<input>`/`<textarea>`/`<select>`/
`contenteditable`, and writes via the native `.value` setter plus dispatched
`input`/`change` events (`form-scanner/src/scan.ts`, `fill.ts`).

**Figma has no DOM for design content.** Figma renders its entire canvas to a
**single WebGL/WebGPU `<canvas>` element** — they built their own DOM, compositor,
and text-layout engine specifically to bypass the browser's HTML pipeline. Text
layers, frames, and component instances are GPU objects, not HTML nodes.
Consequences:

- A content script's `querySelectorAll` sees Figma's chrome (panels, toolbars) but
  **zero design content** — the layers a designer wants to fill are invisible to the DOM.
- There is no `.value`/event path to write text into a layer; that surface doesn't exist.
- Figma desktop is an Electron app and does not load Chrome extensions at all.

So "install the extension and point it at Figma" is a dead end at the architecture
level. The supported path is Figma's **Plugin API**.

> **Audited alternatives (all dead ends for _writing_ design content):** the Figma
> **REST API** is read-only for file content; **Dev Mode** plugins are read-only;
> **FigJam widgets** can edit text but only by calling the _same_ Plugin API in
> event handlers (a more constrained variant, not a different path); unofficial
> **desktop-injection** hacks (e.g. `figma-patcher` via `--remote-debugging-port`)
> only reach the surrounding app chrome — injected DOM JS still cannot read or write
> canvas text nodes. **A Design-mode Plugin-API plugin (`editorType: ["figma"]`) is
> the only supported way to create/edit text.**

## The supported approach: a Figma plugin that reuses our logic

Figma's official extensibility model: a plugin traverses the node tree
(`figma.currentPage.selection`, node iteration) and writes text via
`await figma.loadFontAsync(font)` then `textNode.characters = "…"` (or
`insertCharacters` to preserve styling). Plugin UI runs in an iframe
(`figma.showUI`) that talks to the sandbox over `postMessage` — conceptually the
same split as our content-script ↔ side-panel messaging, different transport.

### What is reused (the brains) — verified host-agnostic

These packages have **no DOM/Chrome/Vue/Figma source dependency** (confirmed by
`package.json` deps + a grep of source for `document`/`window`/`chrome.`/`vue`/
`navigator`/`figma`) and are reused **without source edits** — after bundling
(see realm split):

| Package                       | Role in the Figma plugin                                                                                                                             | Realm                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@quikfill/schemas`           | Zod contracts (extend with Figma concepts — see below)                                                                                               | both                           |
| `@quikfill/generators`        | seeded/random value generation                                                                                                                       | sandbox                        |
| `@quikfill/autofill-core`     | classify fields, match profiles, build the fill plan                                                                                                 | sandbox                        |
| `@quikfill/ai`                | **pure** redaction of field summaries + AI-proposal validation (no network code)                                                                     | sandbox                        |
| `@quikfill/api-client`        | the **network-bearing** package — `POST /ai/classify-fields`, auth/refresh. Was missing from the original table; it dictates where network code runs | **iframe** (or sandbox + shim) |
| `@quikfill/ui`                | shadcn-vue (reka-ui) components for the plugin's iframe UI                                                                                           | iframe                         |
| Backend (`quikfill-services`) | auth, AI routing, profile sync — same API contract                                                                                                   | n/a                            |

> **Correction to the original brief:** it listed `@quikfill/ai` as the AI/network
> package. `@quikfill/ai` is **pure transform/validation** (`buildFieldSummaries`,
> `validateAiSuggestions`, `suggestionToProposal`); the actual backend `fetch` lives
> in **`@quikfill/api-client`** (`ai-client.ts` → `http.ts`). That distinction
> determines realm placement below.

### Where each piece runs (realm split)

The Figma plugin has **two JS environments**, and "reuse unchanged" only holds once
each package is placed in the right one:

- **Sandbox (`code.ts`)** — a restricted realm (QuickJS-style): **has** the Figma
  scene graph (`figma.*`, nodes, `loadFontAsync`); **lacks** `document`/`window` and
  a standards `fetch` (`globalThis.fetch` is `undefined`). Pure logic runs here:
  `schemas`, `generators`, `autofill-core`, `ai` (redaction/validation), and the new
  `figma-adapter` scan/fill/storage.
- **UI iframe (`figma.showUI`)** — a normal sandboxed iframe **with** a real DOM and
  a permissive CSP (inline styles/eval OK). The Vue 3 + reka-ui + Tailwind UI from
  `@quikfill/ui` runs here. It is also the only realm with a **standards `fetch`**.
- **Network boundary (the crux the brief understated):** the sandbox cannot make a
  normal `fetch`. Two options:
  1. **Sandbox `figma.fetch`** — but it is a _reduced_ fetch (string URL only,
     plain-object headers, and a **plain-object response with no `Response` class**).
     Our `api-client/http.ts` assumes a standards `Response` (`response.ok`,
     `.status`, `.clone().json()`, `204` handling), so this path needs a
     **Response-shape shim**. The backend domain must be in `manifest.networkAccess.allowedDomains`.
  2. **Iframe transport** — the iframe (real `fetch`, real `Response`) performs the
     call and relays results to the sandbox over `postMessage`. Cleanest fit for
     `api-client`, but the iframe has a **null origin**, so the backend must send
     `Access-Control-Allow-Origin: *` (or echo the origin) for those routes.

  The transport is already **dependency-injected** (`http.ts`: `config.fetch ?? globalThis.fetch`),
  so we re-point it without rewriting call sites.

### What must be built new (the host adapter)

`form-scanner` is the **web/DOM** host adapter and `browser-adapter` is the
**Chrome** host adapter (it is the **only** package that touches `chrome.*` —
verified by grep; the lone out-of-package hit is a doc comment in
`schemas/src/adapters.ts`). Neither is touched. The Figma plugin needs its own
**Figma-API host adapter**, isolated the same way:

- **`packages/figma-adapter`** (NEW — Figma-API-aware, **not** Vue-aware): the
  Figma equivalent of `form-scanner` + the messaging half of `browser-adapter`.
  - `scan-figma.ts` — traverse nodes → produce the existing `DetectedField` contract
    (synthesizing all required fields — see the corrected mapping).
  - `fill-figma.ts` — consume the plan → group by font, `loadFontAsync`, set
    `node.characters` / `insertCharacters`; capture prior text for undo.
  - `bridge.ts` — `postMessage` transport between sandbox (`code.ts`) and UI iframe;
    also carries the network relay if the iframe-transport option is chosen.
  - `storage-figma.ts` — `figma.clientStorage` (string-only; JSON-serialize) behind
    the existing `StorageAdapter` interface (`get`/`set`/`delete`/`list`).
- **`apps/figma-plugin`** (NEW): `manifest.json` (`name`, `id`, `api`,
  `editorType: ["figma"]`, `main`, `ui`, `networkAccess.allowedDomains`),
  `src/code.ts` (sandbox), and `src/ui/` (Vue iframe reusing `@quikfill/ui`,
  mirroring the side panel).

### The field mapping (the crux) — corrected

Map Figma nodes onto the **real** `DetectedField` shape (`schemas/src/detected-field.ts`).
The original table mapped the layer name to a field called `label` — **there is no
`label` field**, and `classifyField` only reads `[name, domId, labelText, placeholder,
ariaLabel]` (`classify.ts:123`). Routing the layer name anywhere else yields **zero
classifier signal** (and would make the R2 spike fail artificially). Corrected mapping:

| Target `DetectedField` field | Required?                     | Figma source                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `labelText`                  | optional but **load-bearing** | **layer name** (this is the field `classify()` reads) → nearby text → component-property name                                                                                                                                   |
| `id`                         | **required** (`min(1)`)       | a scan-unique id (e.g. running index) — the scanner identity, **not** the node id                                                                                                                                               |
| `tagName`                    | **required**                  | `"input"`, or `"textarea"` for multiline text (drives the `notes` fallback)                                                                                                                                                     |
| `inputType`                  | **required**                  | always `"text"` (Figma has no input types)                                                                                                                                                                                      |
| `domFingerprint`             | **required**                  | a **stable** hash of `node.id` + frame/page path. `buildPreviewPlan` keys saved mappings off this (`plan.ts:88`); it **is** the cross-surface-persona wedge — if it isn't stable across sessions, persona reuse silently breaks |
| `currentValue`               | optional                      | `TextNode.characters`                                                                                                                                                                                                           |
| `sectionHeading`             | optional (AI only)            | enclosing frame / component name (read by `ai/summaries.ts`, **not** by `classify()`)                                                                                                                                           |
| `nearbyText`                 | optional (AI only)            | sibling text in the same frame (read by `ai/summaries.ts`)                                                                                                                                                                      |
| fill target (out-of-band)    | —                             | the real `node.id`, kept by the adapter to write back via `figma.getNodeById`                                                                                                                                                   |

> Note: schema `name` is the HTML _name attribute_ and is distinct from the scanner
> `id`. Don't put the node id in `name`; put a scan-unique id in `id` and the node id
> in the adapter's own write-back map.

New Zod schemas (in `@quikfill/schemas`) for Figma-only concepts: node id, font
descriptor, mixed-font/missing-font outcomes, selection scope.

---

## Competitive reality (be honest before building)

This is a **mature, partly-free category** — not open territory:

| Plugin                                                   | What it does                                                                          | Overlaps our…                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| **Content Reel** (Microsoft)                             | Fills selected layers with names/emails/avatars from reusable "reels"                 | profile/reusable data             |
| **TinyFaces**                                            | Text layers → names, shape layers → matching avatars                                  | semantic layer matching           |
| **Data Lab**                                             | Variables → names/emails/dates/phones with formatting                                 | generator rules + masks           |
| **Dummy Text AI / Typper / MagiCopy / FigGPT**           | Prompt-driven realistic text into layers                                              | AI generation                     |
| **Persona / Random User / UserPop / Avatars Generators** | Generate one **coherent** fictional person (name + email + company + face) in a click | persona/coherent-identity concept |
| **Lorem Ipsum / Random Name Generator**                  | The commodity boilerplate tier                                                        | the "easy freebie"                |

**Honest conclusion:** "classify a layer named `Email` and put an email there" and
"AI-generated realistic copy" are **already commoditized**, several free. Shipping
only that makes us plugin #51.

### What is actually defensible (narrower, and re-anchored)

> **Correction:** the original brief called "one coherent identity" a _genuine market
> gap_. The audit refutes that — Persona Generator, Random User Generator, UserPop and
> Avatars Generator already produce a single coherent fictional person in one click, so
> **coherence is table stakes, not a gap.** The defensible wedge is narrower:

1. **One persona pinned across an entire multi-screen flow.** Competitors randomize
   per-layer (or per-run), so a header, an avatar, a settings page, and a confirmation
   email drift into four different people. A _managed library of reusable, named test
   personas_ that stay identical across **every screen of a mockup** is the
   under-served behavior. (Note: what designers want is usually a _plausible reusable
   fake_ persona, not the user's own real identity repeated — frame the hook that way.)
2. **Account / data integration as a distribution advantage.** The same profiles the
   user already built for web form-filling, available in Figma, requires our account,
   backend, and saved data. This is a **distribution/data advantage**, not a
   defensible _mechanic_ — a competitor can copy the feature and bolt on a login +
   persona library. So it only holds as long as we own the user's data layer on the
   web side.

**Strategic read:** this only makes sense as an **extension of an existing QuikFill
web user base** ("your data, now in Figma too"), _not_ as a standalone land-grab
against Content Reel. Free-vs-gated and 4th-surface ownership are **gate inputs**, not
post-build details (see Gaps).

---

## Decision gate (run this BEFORE building) — revised to two-tier

The one thing that isn't obviously feasible is **whether `autofill-core`'s
classifier produces useful results on Figma layer names** (designers name layers
`Text`, `Label`, `email copy 2`, not `<label for>`). This is go/no-go.

Why it's genuinely at risk: with `inputType` forced to `"text"` and no
`autocomplete`/`name`/`domId`, **every high-confidence path in `classifyField` is
dead** — the `select`/`checkbox` branches, the `autocomplete` map (0.95), and the
`email`/`tel`/`date` type fast-paths all require web-only signals. Everything
collapses to the keyword regex over `labelText` (capped ~0.85).

**Gate run (2026-05-30) — reproducible, committed:**

1. A labeled **two-tier corpus** of 130 realistic Figma layer names — a **forms**
   tier (sign-up/profile/checkout/contact) and a **dashboards/tables** tier, plus
   decoration/structural noise — lives at
   `packages/autofill-core/src/figma-r2-corpus.ts`. `expectedType` is ground truth
   (assembled across 205 candidate names by 8 category agents, then adversarially
   label-reviewed).
2. `packages/autofill-core/src/figma-r2-gate.test.ts` feeds each name through the
   real `classifyField()` **routed into `labelText`** and measures **recall**,
   **type-precision**, and **decoration false-fill** per tier against explicit bars.

**Result (130 names):**

| Tier                  | n   | recall  | type-precision | false-fill |
| --------------------- | --- | ------- | -------------- | ---------- |
| **forms**             | 63  | **93%** | **93%**        | 16%        |
| **dashboards/tables** | 46  | **44%** | 100%           | 10%        |
| decoration            | 21  | —       | —              | **0%**     |

Bimodal, confirming the earlier prototype: form vocabulary classifies well; generic
dashboard/table vocabulary (Revenue, MRR, Status, Role) recalls less than half, and
decoration is never false-filled. The gate also guards the two classifier precision
bugs it surfaced — now **fixed** in `classify.ts` with word-boundary keywords (see
build risk #3). The 16% forms false-fill is the weakest axis (e.g. `Card Number` →
`number`); harmless in a mockup but worth tightening.

**Gate (two-tier, because one threshold can't express a bimodal result):**

- **Forms cleared the bar** (93% recall / 93% type-precision, low false-fill), so the
  only remaining gate is the **product question — does the web product have real
  users?** If yes → green-light; lead with **persona pinned across a flow**, lorem ipsum
  as a freebie. **Scope form mockups for v1; arbitrary dashboards (44% recall) are out
  of scope.**
- Had forms been weak → the project collapses to "another content filler"; only worth
  it as a cheap retention feature for existing users, never a growth bet. (Not the case.)

## Build risks (only relevant after the gate passes)

1. **Bundling** — Figma ships **one** IIFE sandbox file (no ESM `import`) + **one**
   inlined-HTML UI. All eight packages are source-only (`main: ./src/index.ts`), so a
   single-file bundle (esbuild/Rollup `inlineDynamicImports`; `vite-plugin-singlefile`
   for the UI) is mandatory — this is what "reuse unchanged" actually costs.
2. **Network shim** — the sandbox has no standards `fetch`; pick `figma.fetch` + a
   `Response`-shape shim, or an iframe `postMessage` transport with backend CORS
   `Access-Control-Allow-Origin: *` (see realm split). Declare `networkAccess.allowedDomains`.
3. **Classifier precision** — the recall-only framing can hide wrong-fills. Two such
   substring bugs the spike surfaced are now **fixed**: `count` matched
   `county`/`discount` → `number`, and `date` matched `updated`/`validate` → `date`
   (while `created` fell through, an inconsistency). Both now use word boundaries
   (`classify-precision.test.ts` is the regression guard). The lesson stands: have the
   gate score **precision**, not just recall.
4. **Font loading** — mixed fonts in one node (`figma.mixed`) and fonts not installed
   locally (`loadFontAsync` rejects). Load **all** fonts in a node before writing;
   decide skip-vs-fallback and surface skips in results.
5. **Component instances** — text inside an instance is often only writable via an
   exposed component property, not `characters`. Confirm what's reachable; degrade gracefully.
6. **Selection scope** — fill current selection vs. whole frame vs. whole page.
   Designers expect "fill what I selected"; default to selection.
7. **Persona coherence** — prove the wedge: fill ≥3 layers across a frame from one
   profile and confirm name/email/etc. stay consistent (depends on a **stable** `domFingerprint`).
8. **Manifest correctness** — `name`, `id`, `api` are required; `editorType` **must**
   include `"figma"` (Dev Mode is read-only and cannot write nodes). `clientStorage`/
   `setPluginData` store **strings only** → JSON-serialize structured data.
9. **No-DOM mindset** — the implementer must not reach for `form-scanner`; it is
   web-only. All Figma I/O goes through the new `figma-adapter`.

---

## Proposed structure (for the implementer)

> **Full file-by-file scope** — realms, exports/signatures, dependencies, the lean
> schema additions, and the adversarial-review corrections — lives in
> [`FIGMA_ADAPTER_SCOPE.md`](./FIGMA_ADAPTER_SCOPE.md). Summary:

```txt
packages/
  figma-adapter/        # NEW — Figma-API-aware, NOT Vue-aware, sandbox-pure (mirrors form-scanner)
    src/scan-figma.ts    # nodes → DetectedField (synthesize id/tagName/inputType/domFingerprint, route name→labelText)
    src/fill-figma.ts    # FillInstruction[] → loadFontAsync (all fonts) → node.characters + undo; never throws per field
    src/fonts.ts         # figma.mixed + missing-font handling (the one piece with no form-scanner analog)
    src/fingerprint-figma.ts # stable domFingerprint (the persona moat) — best-effort under benign edits
    src/storage-figma.ts # figma.clientStorage behind StorageAdapter (sandbox-only; objects, NOT JSON-serialized)
    src/bridge.ts        # sandbox-side postMessage envelope + shared constants/guards (id-correlated)
apps/
  figma-plugin/         # NEW
    manifest.json        # name, id, api, editorType:["figma"], main, ui, networkAccess.{allowedDomains,reasoning}
    src/code.ts          # sandbox entry — registers scan/fill/undo/storage handlers (bundled IIFE)
    src/ui/              # Vue iframe — engine + ALL network + iframe-side transport; reuse @quikfill/ui (single-file)
```

## Conventions this must follow (same as the rest of the repo)

- **Compose the shared packages; never reimplement the engine.** Figma specifics
  live only in `figma-adapter` + the plugin entrypoints. "Compose" = reuse without
  source edits, _after_ bundling + realm placement + transport wiring.
- **AI is review-first.** AI interprets, the user confirms in a preview; the plugin
  never silently writes layers. Send minimized/redacted field summaries (layer
  names, types, nearby text) — never dump full design content. No model key in the
  bundle; production AI routes through `quikfill-services` (`api-client`, in the iframe realm).
- **Schemas first.** Add/extend Zod contracts in `@quikfill/schemas` before code;
  parse all AI output and storage hydration with Zod.
- **Persistence behind adapters** (`StorageAdapter`); local-first; never put
  sensitive values in synced/shared (`document`) plugin data.
- **UI:** shadcn-vue from `@quikfill/ui` only; Composition API + `<script setup>`;
  Pinia setup stores own shared state; Tailwind v4 semantic classes; a11y on inputs
  (with an explicit plan for the iframe).
- **Quality gate (the "done" bar):** `pnpm lint && pnpm format:check && pnpm
typecheck && pnpm build && pnpm test` (+ `pnpm e2e` when behaviour changed).
- Update this file's Status table as work lands.

## Gaps / open decisions that gate the build

The audit flagged these as **inputs to the go decision**, not afterthoughts:

- **Build effort estimate.** Only the spike is sized (~0.5–1 day). `figma-adapter`,
  `apps/figma-plugin`, Zod extensions, single-file bundling, the `figma.fetch`
  Response shim / iframe transport are all **unsized** — size them before committing.
- **4th-surface ownership.** The parent roadmap (`IMPLEMENTATION_PLAN.md`) lists only
  three surfaces with no owner or slot for Figma. A 4th surface is permanent
  maintenance (Figma API churn, font/instance edge cases) — name a maintainer.
- **Monetization decision.** Free-vs-gated is left open, yet the moat depends on
  requiring sign-in to pull saved profiles (and Stripe billing is still Partial on the
  parent roadmap). Decide before building.
- **Figma Community publishing/review.** Submission + plugin review/approval + update
  cadence are unaddressed — a real gate to reaching users.
- **i18n & a11y.** The product is i18n-ready elsewhere but the plugin has no
  localization plan, and a11y is a single line with no iframe-specific plan.
- **FigJam scope.** Recommend design-only for v1 — but decide it explicitly.

## Open questions for product

- Does the web product have enough active users to justify a retention/expansion
  surface? (This is the real gating question, more than any technical risk.)
- Free Community plugin vs. gated behind a QuikFill account? (The moat argues for
  requiring sign-in so it pulls the user's existing profiles.)
- FigJam support, or Figma design files only? (Recommend design-only for v1.)

## Sources

- [Building a professional design tool on the web — Figma](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/)
- [Figma Rendering: Powered by WebGPU — Figma](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)
- [TextNode.characters — Figma Plugin Docs](https://www.figma.com/plugin-docs/api/properties/TextNode-characters/)
- [Working with Text — Figma Plugin Docs](https://www.figma.com/plugin-docs/working-with-text/)
- [Plugin manifest — Figma Plugin Docs](https://www.figma.com/plugin-docs/manifest/)
- [Making network requests (`figma.fetch` / `networkAccess`) — Figma Plugin Docs](https://www.figma.com/plugin-docs/making-network-requests/)
- [How plugins run (sandbox + UI iframe) — Figma Plugin Docs](https://www.figma.com/plugin-docs/how-plugins-run/)
- [Plugins to design with real content — Figma](https://www.figma.com/blog/plugins-to-help-you-design-with-real-content/)
- [Best Figma AI Plugins 2025 — F22 Labs](https://www.f22labs.com/blogs/15-best-figma-ai-plugins-for-ui-ux-designers/)
- Internal audit (2026-05-30): codebase verification of `classify.ts`, `detected-field.ts`,
  `plan.ts`, `adapters.ts`, `api-client/http.ts`; reproducible spike fixture.
