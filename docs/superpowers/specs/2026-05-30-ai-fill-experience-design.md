# AI Fill Experience — Coverage, Clarity & Defaults

**Date:** 2026-05-30
**Status:** Draft for review
**Repos:** `quikfill-frontend` (primary) + `quikfill-services` (backend, lockstep)

## Problem

Clicking **Ask AI** on a field like `EIN #` shows "AI thinks this is a number — 90%",
then the field dead-ends at "Quikfill has no value to fill here yet". Users read
this as a contradiction and as a failure ("AI fails to provide values for common
fields"). Investigation shows it is mostly working-as-designed plus three real gaps:

1. **Mental model:** "Ask AI" only **classifies** a field into a closed vocabulary
   (`AiSuggestion` carries `semanticType`/`confidence`, never a value). The _value_
   comes from saved records or an opt-in sample generator. The UI oversells this:
   the green **confidence** meter reads as progress, and the "no value" state is a
   dead-end with no in-context fix.
2. **Vocabulary coverage:** the closed `SEMANTIC_TYPES` set (~19 types + `unknown`)
   has no `taxId`/EIN, `ssn`, or `username`/alias. Common fields collapse to
   `number`/`unknown`, and even the generic `number` generator emits `0–1000`, not
   an EIN like `12-3456789`.
3. **Inconsistent defaults:** `defaultFillSource` defaults to `recordField`
   ("only my saved data"), but `buildPreviewPlan` ignores it and **always** assigns
   a generator source to classified fields. The preference is honored only on the
   AI path and the source-pill cycle (`useFillSession`), so behavior is split and
   surprising.

## Goals

- Make the AI experience **legible**: the user understands what "Ask AI" does, what
  the confidence meter means, and how to get a value when there isn't one.
- **Recognize** common formatted/identifier fields (EIN, SSN, username/alias) and
  any masked field generically, and generate format-correct **sample** values.
- Make values appear by default for ordinary fields, **without** ever silently
  proposing a fake sensitive identifier.
- Keep the privacy stance intact: AI only classifies; samples are clearly labeled
  and always reviewed before submit; redacted summaries only.

## Non-goals

- No change to _how_ AI classifies (still a closed vocabulary, server-mediated,
  schema-validated). No new model features.
- No locale expansion (still `en` data).
- No generation from arbitrary HTML `pattern` regexes (we read explicit
  `data-maska`-style masks; an un-parseable mask falls back to "needs a value").
- No change to the review-before-submit invariant.

## Closed-vocabulary lockstep (applies to Part 2)

The semantic vocabulary is **duplicated by design** in three places and pinned by
contract tests; all move together in the same change:

- `frontend/packages/schemas/src/ai.ts` — `SEMANTIC_TYPES`, `SEMANTIC_ALIASES`,
  `normalizeSemanticType` (+ `ai.test.ts`).
- `frontend/packages/autofill-core/src/classify.ts` — `KIND_BY_SEMANTIC`,
  `AUTOCOMPLETE_MAP`, `KEYWORD_RULES`, `classifyField`,
  `generatorRuleForSemanticType`.
- `services/src/modules/ai/domain/semantic-types.ts` — `SEMANTIC_TYPES`,
  `ALIASES`, `normalizeSemanticType` (+ `ai-suggestion.spec.ts`), **and** the
  classifier prompt + Gemini `responseSchema` enum in `services/src/modules/ai/**`
  that lists allowed types (exact file to be pinned in the implementation plan).

---

## Part 1 — Clarity (UI/copy; no engine change)

Lowest risk, immediate relief. Files: `apps/chrome-extension/components/sidepanel/PlanCard.vue`,
`AiSuggestionInset.vue`, `lib/display-maps.ts`, and the "Ask AI" trigger component.

- **Confidence meter** gets an explicit label ("AI confidence") so the green bar
  can't be misread as fill progress / completeness.
- **AI inset** copy reframed: "AI identified this as **{type}**. I'll fill it from
  your saved data or a labeled sample — I won't invent a value."
- **"Needs a value" state** becomes actionable: alongside the explanation, show
  one-tap actions — _Save a value_, _Generate a sample_, _Turn on sample data_ —
  wired to the existing `cycleSource` / settings (no new engine logic).
- Optionally relabel the **Ask AI** trigger to make "identify this field" the
  expectation (final wording decided in implementation).

**Acceptance:** a user on a no-value field can tell _why_ there's no value and reach
a value in one tap, and nobody reads the confidence bar as progress.

## Part 2 — Coverage (cross-repo)

### New semantic types (lockstep, + aliases)

| Type       | Generator   | Format / behavior                    | Sensitive? |
| ---------- | ----------- | ------------------------------------ | ---------- |
| `taxId`    | `patterned` | `##-#######` (EIN)                   | yes        |
| `ssn`      | `patterned` | `###-##-####`                        | yes        |
| `username` | `handle`    | name-based handle (e.g. `jdoe17`)    | no         |
| `masked`   | `patterned` | format from the **field's own mask** | no         |

Aliases (examples): `ein`, `employeridentificationnumber`, `fein`, `taxid` → `taxId`;
`ssn`, `socialsecurity` → `ssn`; `alias`, `handle`, `nickname`, `screenname`,
`displayname` → `username`. `classifyField` keyword rules + `AUTOCOMPLETE_MAP`
extended to match these (e.g. `/\bein\b|employer id|tax id/`).

### New generator kinds (`packages/generators/src/generate.ts` + `GeneratorKind` in schemas)

- **`patterned`**: template expansion — `#`→digit, `A`→A–Z, `a`→a–z, `*`→alnum;
  any other char is a literal. Deterministic via the seeded RNG. (Generalizes the
  existing `phone` template.) Options: `{ format: string }`.
- **`handle`**: name-derived username (first/last + small int), lowercased.
  Deterministic.

`taxId`/`ssn` map to `patterned` with a fixed `format`. `masked` is constructed
**per field** at classify/plan time with `format` = the field's captured mask
(the static `KIND_BY_SEMANTIC` entry carries `kind: 'patterned'` with no fixed
format; a saved `masked` mapping persists its `format` in the rule options).

### Mask plumbing (`@quikfill/form-scanner`) — the one structural change

- Add optional `mask?: string` to `DetectedField` (`packages/schemas/src/detected-field.ts`).
- Populate it during scan (`extract.ts`) from `data-maska` (the project's existing
  mask convention; reuse `mask.ts` parsing). An input with no usable mask leaves it
  undefined → `masked` classification not applied → falls through to the normal path.

### Data flow for a `masked` fill

scan captures `field.mask` → `classifyField` returns `semanticType: 'masked'`,
`generatorOptions: { format: field.mask }` → `patterned` generator emits a
conforming value → existing mask-aware filler writes it (already coerces to
`data-maska`). EIN on a `##-#######`-masked field thus yields `12-3456789`.

**Acceptance:** EIN/SSN/alias fields classify to their new types; a masked field
generates a value that conforms to its mask; the three vocabularies stay in lockstep
(contract tests green in both repos).

## Part 3 — Defaults & policy (behavior change)

### Default flip

`DEFAULT_EXTENSION_SETTINGS.defaultFillSource`: `recordField` → **`hybrid`**
(`packages/schemas/src/extension-settings.ts`). Ordinary fields now get a labeled
sample by default when nothing is saved (still reviewed before submit).

### Centralized source policy (fixes the current split/inconsistency)

Introduce one function in `autofill-core`, e.g.:

```
defaultSourceFor(field, classification, { pref, recordMatch }): FillSource
  recordMatch                              -> recordField
  allowsSampleData(pref) && !sensitive
    && hasGenerator(classification)        -> generatorRule
  otherwise                                -> aiGenerated   // "needs a value"
```

- Used by `buildPreviewPlan` (thread `defaultFillSource` + record availability
  through `PreviewOptions`), by `suggestionToProposal` (already takes
  `allowSampleData`; add the sensitivity check), and by the source-pill cycle.
- This removes the current "base plan always samples regardless of setting" bug:
  under `recordField` the base plan no longer fabricates samples; under `hybrid` it
  samples non-sensitive fields.

### Sensitive carve-out

`SENSITIVE_SEMANTIC_TYPES = { 'ssn', 'taxId' }` (autofill-core, shared with the
proposal logic). Sensitive + no saved record → `aiGenerated` **regardless** of the
preference. So EIN/SSN are _recognized_ and one tap from a correctly-formatted
sample (via the pill / Part 1 actions), but never auto-filled with a fake.

**Acceptance:** a fresh scan on a typical form proposes labeled samples for ordinary
fields by default; SSN/EIN/taxId stay "needs a value" until saved or explicitly
sampled; switching the preference back to `recordField` produces no samples anywhere.

---

## Testing strategy

- **Contract tests (both repos):** extend the existing vocabulary-shape tests
  (`schemas/src/ai.test.ts`, `services/.../ai-suggestion.spec.ts`) to include the
  new types + aliases and assert the three lists agree.
- **Unit (autofill-core):** `classifyField` (EIN→`taxId`, alias→`username`, masked
  detection), `defaultSourceFor` matrix (pref × recordMatch × sensitivity).
- **Unit (generators):** `patterned` (format-conforming, deterministic, char
  classes), `handle` (deterministic, plausible).
- **Unit (ai):** `suggestionToProposal` sensitive carve-out under `hybrid`.
- **Unit (form-scanner):** `extract` captures `data-maska` into `field.mask`.
- **UI:** component tests where a harness exists; otherwise verify in the side panel
  (no-value actions, confidence label) and note manual checks.
- **Quality gate:** `pnpm lint/format:check/typecheck/build/test` green in frontend;
  `npm run verify` (incl. OpenAPI snapshot) green in services.

## Sequencing

**Part 1 → Part 2 → Part 3.** Part 1 is independent and ships first for immediate
relief. Part 2 adds the types/generators Part 3's carve-out references. Each part is
its own commit; cross-repo parts land as lockstep commits in both repos with both
gates green.

## Risks & resolved decisions

- **Sensitive IDs never auto-sample** (user decision) — recognized + one-tap
  sample/save, never silent.
- **`masked` depends on scan-time mask capture** — the one structural change; an
  un-parseable/absent mask degrades gracefully to the normal path.
- **Cross-repo drift** — guarded by the contract tests; all three lists edited
  together.
- **Default flip is a real behavior change** — ordinary fields now propose samples
  by default; explicitly chosen, mitigated by labeling + review-before-submit.
