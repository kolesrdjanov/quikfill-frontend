# Per-field AI fill source — design

**Date:** 2026-05-30
**Surface:** `apps/chrome-extension` side panel + `packages/autofill-core`

## Problem

Setting a single field's fill source to **AI** (by clicking the source pill until
it reads "AI") produced the warning **"AI suggestion not generated yet (Iteration
7)."** in the production side panel. Two faults:

1. **Leaked internal copy.** "Iteration 7" is dev-roadmap terminology
   (`docs/IMPLEMENTATION_PLAN.md`) and must never appear in user-facing UI.
2. **Dead source.** `resolveFillSource` (`packages/autofill-core/src/resolve.ts`)
   has no real implementation for the `aiGenerated` source — it returns a hardcoded
   placeholder, so picking "AI" on a field can never produce a value.

Iteration 7 ("Gemini assistance") _did_ ship — but only as the batch **"Ask
Quikfill AI"** flow over ambiguous fields (classify → suggestion → accept →
generator-backed proposal). The per-field `aiGenerated` source was never wired to
that path.

## Key architectural constraint

The AI **classifies** fields into semantic types — it does **not** generate literal
values. `/ai/classify-fields` returns `{ semanticType, confidence, reasons }`. A
concrete value only exists when that semantic type maps to a **generator** via
`generatorRuleForSemanticType`. So "AI fills a field" means **AI classifies →
generator produces the value** — exactly what the existing accept-suggestion flow
(`suggestionToProposal` + `applyAiOverrides`) already does.

## Decision

Give the existing, working accept-suggestion path a **single-field, on-demand**
entry point. No new backend endpoint, no `FillSource` schema change.

### Flow (user cycles a field's source pill to "AI")

1. `cycleSource` lands on `aiGenerated` → sets the AI source (pill shows AI) and
   marks the field `aiFieldStatus = 'loading'`.
2. Async `classifyField(fieldId)`: `buildFieldSummaries([field])` (redacted, one
   field) → `requestAiClassify` (same privacy-safe message → background →
   `/ai/classify-fields`).
3. On a suggestion → `suggestionToProposal(suggestion, field)` → store in
   `aiProposals` → surgically rebuild **just that** plan item from the proposal. If
   the semantic type maps to a generator, the field shows a real generated value;
   otherwise honest "couldn't determine" copy.
4. On offline / no suggestion → `aiFieldStatus = 'unavailable'`; item stays AI with
   a retry affordance.

### Three deliberate decisions

- **Badge shows "Generator" after a successful map** — the value genuinely comes
  from the matched generator, and this is identical to the existing
  accept-suggestion behavior. Consistency over a second AI label.
- **Cycle-position fix.** Because the badge flips to Generator, the cycle would
  otherwise bounce Generator↔AI and never reach Static/Runtime. `cycleSource`
  derives "current" as `aiGenerated` when the field has an AI proposal, so the next
  click advances to `staticValue`. Manual cycling clears the proposal (existing
  behavior).
- **Surgical single-item patch** instead of `acceptSuggestion`'s full
  `rebuildPlan()`, so triggering AI on one field doesn't wipe manual source edits on
  others. Extract `buildItemFromProposal(field, proposal)` shared by
  `applyAiOverrides` and the new path.

## Files

- `packages/autofill-core/src/resolve.ts` — `aiGenerated` branch: replace the
  "Iteration 7" placeholder with honest terminal copy ("AI couldn't determine a
  value for this field.").
- `apps/chrome-extension/lib/useFillSession.ts` — add `aiFieldStatus` ref,
  `classifyField` action, extract `buildItemFromProposal`, adjust `cycleSource`
  (AI trigger + cycle-position fix), clear in `resetAi`.
- `apps/chrome-extension/components/sidepanel/PlanCard.vue` + `App.vue` — show
  per-field `aiStatus`: "Asking AI…" (loading, suppresses warning) / "AI
  unavailable — click to retry" (unavailable).
- Tests: `resolve.ts` new copy (added to `plan.test.ts`). The `chrome-extension`
  app has no test harness (no `vitest`), so the session wiring is verified by
  typecheck + extension build rather than a unit test — scaffolding a jsdom +
  `browser-adapter` mock setup is out of scope for this fix.

## Out of scope

No "AI generates literal values" backend endpoint; no `FillSource` schema change;
no unrelated refactor.
