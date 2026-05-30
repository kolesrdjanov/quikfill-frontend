# Figma Plugin — Research & Requirements Brief (Exploratory)

> **This is a requirements/research brief, not an approved iteration.** It captures
> a feasibility investigation into whether Quikfill can serve a Figma use-case, the
> honest competitive read, and a de-risking spike to run **before** committing to a
> build. Parent roadmap: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
> Engine spec: [`SHARED_PACKAGES_PLAN.md`](./SHARED_PACKAGES_PLAN.md). Sibling
> surface for comparison: [`CHROME_EXTENSION_PLAN.md`](./CHROME_EXTENSION_PLAN.md).

> **North star:** if we build this, it is a **fourth surface** (`apps/figma-plugin`)
> that **composes the existing shared packages** exactly like the extension does. It
> does **not** reimplement classification, planning, generation, or contracts.
> Figma-API-specific code is isolated in a new host adapter, mirroring how
> `form-scanner`/`browser-adapter` isolate the web/Chrome specifics.

## Status

| #   | Item                                                          | Status        |
| --- | ------------------------------------------------------------- | ------------- |
| R1  | Feasibility research (architecture + competitive scan)        | ✅ Done       |
| R2  | **Decision-gate spike** (classification quality on layer names) | ⛔ Not started |
| —   | Build (only if R2 passes the gate — see "Decision gate")      | 🔒 Blocked    |

---

## The request (original use-case)

> A designer wants to fill Figma text layers with realistic boilerplate — names,
> emails, lorem ipsum, product copy — instead of typing it by hand. Does Quikfill
> fit this use-case, and can the Chrome extension work in Figma?

## Key finding: the extension cannot run inside Figma

Quikfill's web engine (`form-scanner`) is **pure DOM manipulation** — it walks the
page with `querySelectorAll`, identifies `<input>`/`<textarea>`/`<select>`/
`contenteditable`, and writes via the native `.value` setter plus dispatched
`input`/`change` events.

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

## The supported approach: a Figma plugin that reuses our logic

Figma's official extensibility model: a plugin traverses the node tree
(`figma.currentPage.selection`, node iteration) and writes text via
`await figma.loadFontAsync(font)` then `textNode.characters = "…"` (or
`insertCharacters` to preserve styling). Plugin UI runs in an iframe
(`figma.showUI`) that talks to the sandbox over `postMessage` — conceptually the
same split as our content-script ↔ side-panel messaging, different transport.

### What ports unchanged (the brains)

These packages have **no DOM/Chrome/Vue/Figma dependency** and are reused as-is:

| Package              | Role in the Figma plugin                                  |
| -------------------- | --------------------------------------------------------- |
| `@quikfill/autofill-core` | classify fields, match profiles, build the fill plan   |
| `@quikfill/ai`       | redacted field summaries + AI proposal validation         |
| `@quikfill/generators` | seeded/random value generation                          |
| `@quikfill/schemas`  | Zod contracts (extend with Figma concepts — see below)    |
| `@quikfill/ui`       | shadcn-vue components for the plugin's iframe UI           |
| Backend (`quikfill-services`) | auth, AI routing, profile sync — same API contract |

### What must be built new (the host adapter)

`form-scanner` is the **web/DOM** host adapter and `browser-adapter` is the
**Chrome** host adapter; neither is touched. The Figma plugin needs its own
**Figma-API host adapter**, isolated the same way:

- **`packages/figma-adapter`** (NEW — Figma-API-aware, **not** Vue-aware): the
  Figma equivalent of `form-scanner` + the messaging half of `browser-adapter`.
  - `scan-figma.ts` — traverse nodes → produce the existing `DetectedField` contract.
  - `fill-figma.ts` — consume `FillInstruction[]` → group by font, `loadFontAsync`,
    set `node.characters` / `insertCharacters`; capture prior text for undo.
  - `bridge.ts` — `postMessage` transport between sandbox (`code.ts`) and UI iframe.
  - `storage-figma.ts` — `figma.clientStorage` / `setPluginData` behind the existing
    `StorageAdapter` interface.
- **`apps/figma-plugin`** (NEW): `manifest.json` (`editorType: ["figma"]`, `main`,
  `ui`, `networkAccess.allowedDomains` for the backend), `src/code.ts` (sandbox),
  and `src/ui/` (Vue iframe reusing `@quikfill/ui`, mirroring the side panel).

### The field mapping (the crux)

Map Figma nodes onto the existing `DetectedField` shape so `autofill-core` works untouched:

| `DetectedField` field | Figma source                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `label`               | layer name → nearby text node in same frame → component-property name |
| `name`                | node `id`                                                           |
| `inputType`           | always `text` (Figma has no input types)                            |
| `sectionHeading`      | enclosing frame / component name                                    |
| current value         | `TextNode.characters`                                               |
| fill target           | node `id` (write back via `figma.getNodeById`)                      |

New Zod schemas (in `@quikfill/schemas`) for Figma-only concepts: node id, font
descriptor, mixed-font/missing-font outcomes, selection scope.

---

## Competitive reality (be honest before building)

This is a **mature, partly-free category** — not open territory:

| Plugin                       | What it does                                              | Overlaps our…           |
| ---------------------------- | -------------------------------------------------------- | ----------------------- |
| **Content Reel** (Microsoft) | Fills selected layers with names/emails/avatars from reusable "reels" | profile/reusable data   |
| **Content Reel AI**          | Context-aware realistic content                          | AI field-classification |
| **TinyFaces**                | Text layers → names, shape layers → matching avatars     | semantic layer matching |
| **Data Lab**                 | Variables → names/emails/dates/phones with formatting    | generator rules + masks |
| **Dummy Text AI / Typper / MagiCopy / FigGPT** | Prompt-driven realistic text into layers | AI generation           |
| **AI Persona Generator**     | Generates a structured persona artifact                  | profile/persona concept |
| **Lorem Ipsum / Random Name Generator** | The commodity boilerplate tier               | the "easy freebie"      |

**Honest conclusion:** "classify a layer named `Email` and put an email there" and
"AI-generated realistic copy" are **already commoditized**, several free. Shipping
only that makes us plugin #51.

### What is actually defensible (narrower, but real)

1. **Cross-surface persona consistency.** Competitors randomize per-layer, breaking
   coherence (avatar, header name, email, settings end up four different people).
   Our **profile = one coherent identity**, so we can fill an entire multi-screen
   mockup with the *same* persona. That coherence is a genuine market gap.
2. **The same profile the user built for web form-filling now fills their Figma
   mockup.** No Figma-native plugin can replicate this — it requires our account,
   backend, and the user's saved profiles. The moat is that **Quikfill already owns
   the user's data layer on the web side**, not the (easily-copied) Figma mechanics.

**Strategic read:** this only makes sense as an **extension of an existing Quikfill
web user base** ("your data, now in Figma too"), *not* as a standalone land-grab
against Content Reel.

---

## Decision gate (run this BEFORE building)

The one thing that isn't obviously feasible is **whether `autofill-core`'s
classifier produces useful results on Figma layer names** (designers name layers
`Text`, `Label`, `email copy 2`, not `<label for>`). This is go/no-go.

**Spike (≈0.5–1 day, no new app needed):**
1. Collect layer-name sets from 5–10 real Figma Community mockups (forms, profile
   cards, dashboards, tables).
2. Feed those names through the existing `autofill-core` `classify()` offline
   (a Vitest fixture or a tiny script — no Figma runtime required).
3. Measure the semantic hit rate and eyeball quality.

**Gate:**
- Hit rate clears a useful bar **AND** the web product has real users → green-light;
  lead with **cross-surface personas**, lorem ipsum as a freebie.
- Hit rate weak → the project collapses to "another content filler"; only worth it
  as a cheap retention feature for existing users, never a growth bet. Stop here.

## Build risks (only relevant after the gate passes)

1. **Font loading** — mixed fonts in one node (`figma.mixed`), fonts not installed
   locally (`loadFontAsync` rejects). Decide skip-vs-fallback; surface skips in results.
2. **Component instances** — text inside an instance is often only writable via an
   exposed component property, not `characters`. Confirm what's reachable; degrade gracefully.
3. **Selection scope** — fill current selection vs. whole frame vs. whole page.
   Designers expect "fill what I selected"; default to selection.
4. **Persona coherence** — prove the wedge: fill ≥3 layers across a frame from one
   profile and confirm name/email/etc. stay consistent.
5. **No-DOM mindset** — the implementer must not reach for `form-scanner`; it is
   web-only. All Figma I/O goes through the new `figma-adapter`.

---

## Proposed structure (for the implementer)

```txt
packages/
  figma-adapter/        # NEW — Figma-API-aware, NOT Vue-aware (mirrors form-scanner)
    src/scan-figma.ts
    src/fill-figma.ts
    src/bridge.ts        # postMessage transport
    src/storage-figma.ts # behind StorageAdapter
apps/
  figma-plugin/         # NEW
    manifest.json        # editorType:["figma"], main, ui, networkAccess.allowedDomains
    src/code.ts          # sandbox entry — traverse + write + undo
    src/ui/              # Vue iframe — reuse @quikfill/ui, mirror side-panel UX
```

## Conventions this must follow (same as the rest of the repo)

- **Compose the shared packages; never reimplement the engine.** Figma specifics
  live only in `figma-adapter` + the plugin entrypoints.
- **AI is review-first.** AI interprets, the user confirms in a preview; the plugin
  never silently writes layers. Send minimized/redacted field summaries (layer
  names, types, nearby text) — never dump full design content. No model key in the
  bundle; production AI routes through `quikfill-services`.
- **Schemas first.** Add/extend Zod contracts in `@quikfill/schemas` before code;
  parse all AI output and storage hydration with Zod.
- **Persistence behind adapters** (`StorageAdapter`); local-first; never put
  sensitive values in synced storage.
- **UI:** shadcn-vue from `@quikfill/ui` only; Composition API + `<script setup>`;
  Pinia setup stores own shared state; Tailwind v4 semantic classes; a11y on inputs.
- **Quality gate (the "done" bar):** `pnpm lint && pnpm format:check && pnpm
  typecheck && pnpm build && pnpm test` (+ `pnpm e2e` when behaviour changed).
- Update this file's Status table as work lands.

## Open questions for product

- Does the web product have enough active users to justify a retention/expansion
  surface? (This is the real gating question, more than any technical risk.)
- Free Community plugin vs. gated behind a Quikfill account? (The moat argues for
  requiring sign-in so it pulls the user's existing profiles.)
- FigJam support, or Figma design files only? (Recommend design-only for v1.)

## Sources

- [Building a professional design tool on the web — Figma](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/)
- [Figma Rendering: Powered by WebGPU — Figma](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)
- [TextNode.characters — Figma Plugin Docs](https://www.figma.com/plugin-docs/api/properties/TextNode-characters/)
- [Working with Text — Figma Plugin Docs](https://www.figma.com/plugin-docs/working-with-text/)
- [Plugins to design with real content — Figma](https://www.figma.com/blog/plugins-to-help-you-design-with-real-content/)
- [Best Figma AI Plugins 2025 — F22 Labs](https://www.f22labs.com/blogs/15-best-figma-ai-plugins-for-ui-ux-designers/)
