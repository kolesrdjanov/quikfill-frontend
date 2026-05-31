# Chrome Extension — In-Page Fill Flow (current)

This is the reference for **how filling works** in the Chrome extension after the
flow revamp. It supersedes the side-panel scan → preview → AI-suggestion → fill
**wizard** (which is disabled but kept in the tree behind a `LEGACY` marker — see
[`CHROME_EXTENSION_PLAN.md`](./CHROME_EXTENSION_PLAN.md)). Implementation plan:
[`../../CHROME_EXTENSION_REVAMP_PLAN.md`](../../CHROME_EXTENSION_REVAMP_PLAN.md).

> **North star (unchanged):** local-first, privacy-aware, composes the shared
> packages. The extension never sends raw HTML or current field values to the
> backend, and Chrome-specific code lives only in `@quikfill/browser-adapter` and
> the extension's own entrypoints.

---

## 1. Target flow

1. The user signs in through the extension surface (popup / side panel) — the
   existing email-OTP auth gate. The surface keeps only **auth**, **subscription
   settings**, and **a single-action scan form**, and nothing else.
2. On **every page**, the content script automatically detects each form, finds
   that form's submit button, and injects **our own floating button** anchored
   near it. The button lives in an **isolated Shadow DOM** so host CSS can't bleed
   in and our styles can't leak out.
3. **Hovering** the floating button reveals a **"Fill"** affordance.
4. **Clicking Fill** collects page globals + redacted per-field metadata, sends it
   to the backend `POST /ai/fill`, the backend prompts Gemini, Gemini returns JSON
   values keyed by our field ids, the backend returns them, and the extension
   **prefills every native input** via the existing `applyFill()`.

### Intentional invariant departure

The repo golden rule is _"AI is review-first; AI never fills the page."_ This flow
**fills directly** from the AI response with no per-field review — a deliberate
change for this surface. The **privacy half is preserved**: we send only redacted
field metadata (label / aria / name / type / placeholder / validation attrs),
**never full HTML and never current field values**.

---

## 2. Content-script lifecycle

The content script (`entrypoints/content.ts`) runs at `document_idle` on
`<all_urls>` and delegates the in-page UI to `entrypoints/content/overlay.ts`. The
existing `onScanRequest` / `onFillRequest` / `onUndoRequest` message handlers stay
(the surface's single-action scan form still uses scan).

```
document_idle
  └─ mountOverlay()
       ├─ scanGrouped(document)            // form-scanner: grouped pass
       ├─ for each DetectedForm with native fields:
       │     └─ inject a floating button anchored to submit → last field → form
       ├─ MutationObserver(document.body)  // debounced, ignores our own nodes
       │     └─ re-scan → add buttons for new forms, drop detached ones, reposition
       ├─ focusin listener                 // re-scan: catches CSS-toggled drawers
       └─ scroll/resize listeners          // re-anchor visible buttons
```

### Detection & grouping

Grouping and submit detection come from `@quikfill/form-scanner`
(`scanFormsGrouped`), not the extension — the package stays DOM-only (no
`chrome.*`, no Vue). Each `DetectedForm` carries `formId`, its member `fieldIds`,
`submitSelectorCandidates`, `frame`, and an optional `label`. Fields with no
`<form>` ancestor are grouped under a **synthetic** form keyed by their nearest
common container, and that container is stamped `data-qf-form` so formless React
forms still group and re-resolve stably.

Existing scanner behaviour is reused unchanged: visibility filtering
(`isVisible`), framework-generated-id filtering (`_r_24_`, `:r9:`, `mui-*`, …),
and `data-qf-id` stamping (our per-input id, used to map AI results back to
elements).

### Submit-button detection (semantics, not a verb list)

`findSubmitButton` identifies a form's action button by **HTML semantics and
position**, never by guessing whether a label contains a "submit" word:

1. an explicit `button[type=submit]` / `input[type=submit]` (or a `form="<id>"`-linked
   one) — unambiguous;
2. inside a real `<form>`, a `<button>` with **no `type`** submits by HTML spec —
   take the last one (the primary action sits at the end);
3. otherwise (formless groups, or forms whose action is a plain/`type=button` button
   driven by JS) the **last visible button-like element that is not an obvious
   dismiss** (Cancel / Close / Back / Reset / …). A short, stable _negative_ list is
   used — we never try to enumerate every "submit" verb.

Crucially, **the floating button is not gated on this succeeding.** A form with
native fields gets a button regardless; submit detection only chooses _where_ to
anchor it.

### Anchoring & the observer

- A form earns a button when it has a detected submit **or** ≥2 native fields (a
  lone field with no action button is left alone, e.g. a nav search box).
- The button is positioned with `getBoundingClientRect()` of, in order: the detected
  submit button → the form's **last field** → the form's group root; re-anchored on
  `scroll` / `resize`.
- A **debounced** `MutationObserver` on `document.body` (`childList` + `subtree`
  only — _not_ attributes, so the scanner's own `data-qf-id` / `data-qf-form`
  stamping can't feed the loop) re-runs the grouped scan on subtree changes, so
  buttons appear on dynamically-added forms (modals, SPA routes), drop when a form
  detaches, and reposition on layout shift.
- A **`focusin`** listener also schedules a re-scan — the safety net for a modal /
  drawer that is pre-rendered and merely toggled via CSS (no node insertion fires no
  mutation); by the time the user focuses a field it is visible and scannable.
- The observer **ignores our own injected nodes** (the shadow host lives on
  `<html>`, outside the observed body subtree), so injecting a button never triggers
  another scan — no feedback loop.

### Not dismissing the modal we sit on

Because the host lives on `<html>` (outside any modal's subtree), a "close on
outside click" modal/drawer would read a press on our button as an outside click
and dismiss itself. The overlay mounts at `document_idle` — **before** any modal
opens — so a **capture-phase guard** on `window` (registered first) runs ahead of
the modal's dismiss listener: when a `pointerdown`/`mousedown`/`pointerup`/`mouseup`
originates from our host it calls `stopImmediatePropagation()`, so no dismiss fires.
`click` is **not** swallowed (the button's own handler still runs), and `mousedown`'s
default is prevented so focus stays in the modal (covers focus-out dismiss).

### The button is the AI-budget signal

The floating button doubles as the at-a-glance budget indicator: it appears only
while the user has AI budget. The overlay seeds entitlements from the background
(`requestEntitlements`) and stays in sync via `onEntitlementsChange` (a
`chrome.storage.onChanged` subscription in the adapter), re-running the scan when
usage, plan, or a monthly reset changes. When `isOverQuota`, **no button is
injected** — all usage numbers/detail live in the side panel, not on the page.
Unknown entitlements (`null`) are treated optimistically (button shown), matching
the surfaces; if a fill then tips the user over budget, it fails with **"AI limit
reached"** and refreshes the snapshot, which removes the buttons.

### Out of scope (for now)

- **Custom selects** and all **non-native widgets** are ignored — native inputs
  only (`input`, `textarea`, `select`). `DetectedField.customWidget` fields are
  skipped when building the request.
- Hidden / `disabled` / `readonly` fields are already excluded by the scanner.
- No per-field review UI — the response fills directly.

---

## 3. The Fill action

When the user clicks **Fill** on a form's button:

1. **Re-scan** that form's group for fresh fields (the DOM may have changed since
   the button was injected).
2. **Build the `AiFillRequest`:**
   - **Page globals:** `document.documentElement.lang`, `document.title`, and the
     `<meta name="description">` content.
   - **Per-field redacted metadata**, native inputs only, each keyed by its
     `data-qf-id` (`fieldId`): `label`, `inputType`, `name`, `placeholder`,
     `autocomplete`, `ariaLabel`, `required`, `pattern`, `options`.
   - **Never** the current value, **never** raw HTML.
3. Send `requestAiFill(payload)` to the background worker (typed message in
   `@quikfill/browser-adapter`).
4. The background calls `api-client` `ai.fill(request)` → `POST /ai/fill` and
   returns the `AiFillResponse`.
5. Map each `values[].fieldId` → a `FillInstruction` and call the existing
   **`applyFill(instructions, root)`** to prefill. Resolution is by
   `[data-qf-id="…"]` first (exact element), then ranked selector candidates.
6. Reflect **spinner → success / error** in the shadow UI. The failure cause is
   surfaced specifically: the background maps the backend error (status + `code`)
   to a coarse reason (`quota` / `rate-limited` / `auth` / `not-configured` /
   `offline` / `error`), and the pill shows matching copy — e.g. a 429
   `QUOTA_EXCEEDED` reads as **"AI limit reached"** (with a fuller tooltip), not a
   flat "Try again". Error states linger a few seconds before resetting.

### id ↔ value mapping

The `data-qf-id` UUID stamped by the scanner is the contract between extension and
backend. The request sends it as `fieldId`; the backend echoes the **same**
`fieldId` in each `AiFillResponse` value; the extension resolves it back to the
exact element. Unknown / malformed ids in the response are dropped.

---

## 4. Backend contract — `POST /api/v1/ai/fill`

Defined by `@quikfill/schemas` (`ai-fill.ts`), the single source of truth shared by
the frontend, the backend DTOs, and the dev mock.

**Request — `AiFillRequest`** (no values, no HTML):

```ts
{
  page: {
    lang: string
    title: string
    description: string
  }
  fields: Array<{
    fieldId: string // = data-qf-id
    label?: string
    inputType: string
    name?: string
    placeholder?: string
    autocomplete?: string
    ariaLabel?: string
    required: boolean
    pattern?: string
    options?: string[]
  }>
}
```

**Response — `AiFillResponse`** (keyed by the same `fieldId`):

```ts
{
  values: Array<{ fieldId: string; value: string }>
}
```

The backend runs the request through the existing `privacy-guard` (rejects raw
HTML, caps field count + payload size), builds a Gemini prompt from the page
globals + the inputs array, calls Gemini with a JSON-constrained `responseSchema`,
re-validates the model output, drops unknown/malformed entries, and returns the
values. The per-route rate limiter and token/entitlement accounting are reused; a
fill spends AI budget like a classify call.

### Audit record (`AiFillRun`)

For **each** `/ai/fill` call the backend persists an audit row in addition to the
`aiUsage` quota row:

| field                    | meaning                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | row id                                                                                                                                                                             |
| `userId`                 | owner (every record is user-scoped)                                                                                                                                                |
| `prompt` (`@db.Text`)    | the **exact** prompt string sent to Gemini (system instruction + serialized request). Redacted metadata only — no HTML, no field values — so safe to store under the privacy rule. |
| `latencyMs`              | how long Gemini took to respond (measured around `generateContent`)                                                                                                                |
| `tokensIn` / `tokensOut` | from Gemini `usageMetadata`                                                                                                                                                        |
| `model`                  | the Gemini model used                                                                                                                                                              |
| `createdAt`              | timestamp                                                                                                                                                                          |

This is the richer reviewable audit; the existing `aiUsage` row is still written
for quota accounting.

---

## 5. Reused building blocks

| Concern                                                              | Where                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| DOM scan, visibility + framework-id filtering, `data-qf-id` stamping | `@quikfill/form-scanner` `scanForms` / `scanFormsGrouped`           |
| Prefill (resolve by `data-qf-id`, mask-aware, verify-after-write)    | `@quikfill/form-scanner` `applyFill`                                |
| Shared Zod contracts                                                 | `@quikfill/schemas` (`detected-field.ts`, `forms.ts`, `ai-fill.ts`) |
| Typed messaging content ↔ background                                 | `@quikfill/browser-adapter` (`ai-messaging.ts`)                     |
| Backend call + auth/token-refresh                                    | `@quikfill/api-client` (`ai-client.ts`) + `background.ts`           |
| Gemini + privacy guard + token accounting                            | `services/src/modules/ai`                                           |

---

## 6. Verification

- **Unit (Vitest):** scanner grouping + submit detection (multiple forms, formless
  React forms, nested submit, no submit, validation-attr extraction);
  request-builder redaction (no values / HTML leak); response → `FillInstruction`
  mapping by id.
- **Backend:** `/ai/fill` happy path (stubbed Gemini); privacy-guard rejection;
  malformed-output filtering; id round-trip; audit row persisted with prompt +
  latency + tokens; e2e cross-user isolation of audit rows.
- **Manual (`pnpm dev:ext`):** multi-form fixture → a button appears near each
  submit → hover shows "Fill" → click → (mock) values prefill the right inputs →
  add a form dynamically → a new button appears → custom selects / hidden
  framework inputs ignored.

E2E coverage for this in-page flow is **deferred** to a later round.
