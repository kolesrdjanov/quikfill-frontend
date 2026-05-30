# AI Fill Experience — Phase 2: Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize EIN/tax-ID, SSN, username/alias, and any masked field, and generate format-correct sample values for them.

**Architecture:** Add a `patterned` (maska-token template) and a `handle` generator to `@quikfill/generators`; add `taxId`/`ssn`/`username`/`masked` to the closed semantic vocabulary in lockstep across `@quikfill/schemas`, `@quikfill/autofill-core`, and the `quikfill-services` backend (all pinned by contract tests); map the new types to those generators; and capture each field's `data-maska` mask onto `DetectedField` at scan time so the `masked` catch-all conforms.

**Tech Stack:** TypeScript, Zod (`@quikfill/schemas`), Vitest (frontend), Jest (services), jsdom.

Spec: [docs/superpowers/specs/2026-05-30-ai-fill-experience-design.md](../specs/2026-05-30-ai-fill-experience-design.md) (Part 2). Backend prompt + `responseSchema` derive from the `SEMANTIC_TYPES` constant (`services/src/modules/ai/infrastructure/gemini.provider.ts`), so editing `semantic-types.ts` flows into both automatically.

---

## File Structure

Frontend (`quikfill-frontend`):

- `packages/schemas/src/generator.ts` — add `patterned`, `handle` to `generatorKindSchema`.
- `packages/generators/src/generate.ts` — implement the two new kinds.
- `packages/generators/src/generate.test.ts` — tests for the new kinds.
- `packages/schemas/src/ai.ts` — add 4 types to `SEMANTIC_TYPES` + aliases.
- `packages/schemas/src/ai.test.ts` — alias/vocabulary tests.
- `packages/autofill-core/src/classify.ts` — `KIND_BY_SEMANTIC`, `KEYWORD_RULES`, masked detection.
- `packages/autofill-core/src/classify.test.ts` — classification tests.
- `packages/schemas/src/detected-field.ts` — add `mask?: string`.
- `packages/form-scanner/src/mask.ts` — export `getMaskPattern`.
- `packages/form-scanner/src/mask.test.ts` — new; tests the helper.
- `packages/form-scanner/src/scan.ts:272` — populate `mask` in `buildField`.

Backend (`quikfill-services`):

- `src/modules/ai/domain/semantic-types.ts` — same 4 types + aliases.
- `src/modules/ai/domain/ai-suggestion.spec.ts` — alias tests.

---

### Task 1: Add `patterned` and `handle` generators

**Files:**

- Modify: `packages/schemas/src/generator.ts:5-20`
- Modify: `packages/generators/src/generate.ts`
- Test: `packages/generators/src/generate.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `generate.test.ts` inside `describe('catalog kinds', ...)`:

```ts
it('patterned fills maska tokens (# digit, @ letter, * alnum)', () => {
  expect(runGenerator(rule('patterned', { format: '##-#######' }), { seed: 'x' })).toMatch(
    /^\d{2}-\d{7}$/,
  )
  expect(runGenerator(rule('patterned', { format: '@@##' }), { seed: 'x' })).toMatch(
    /^[A-Z]{2}\d{2}$/,
  )
})

it('handle looks like a username', () => {
  expect(runGenerator(rule('handle'), { seed: 'x' })).toMatch(/^[a-z]+\d{1,2}$/)
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/generators test`
Expected: FAIL — `rule('patterned', …)` is a type error / `GENERATORS['patterned']` is undefined.

- [ ] **Step 3: Add the kinds to the schema enum**

In `packages/schemas/src/generator.ts`, extend `generatorKindSchema` (after `'customEnum'`, line 19):

```ts
  'customEnum',
  'patterned',
  'handle',
])
```

- [ ] **Step 4: Implement the generators**

In `packages/generators/src/generate.ts`, add a constant near the top (after the imports):

```ts
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
```

Then add two entries to the `GENERATORS` map (e.g. after `customEnum`):

```ts
  patterned(rng, o) {
    const format = str(o, 'format') ?? '########'
    return format.replace(/[#@*]/g, (ch) => {
      if (ch === '#') return String(rng.int(0, 9))
      if (ch === '@') return LETTERS[rng.int(0, 25)]!
      return rng.bool() ? String(rng.int(0, 9)) : LETTERS[rng.int(0, 25)]!
    })
  },
  handle(rng, o) {
    const first = rng.pick(FIRST_NAMES).toLowerCase()
    const last = rng.pick(LAST_NAMES).toLowerCase()
    const sep = str(o, 'separator') ?? ''
    return `${first}${sep}${last}${rng.int(1, 99)}`
  },
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @quikfill/generators test && pnpm --filter @quikfill/generators typecheck`
Expected: PASS. (The `Record<GeneratorKind, …>` type forces both kinds to be implemented.)

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/generator.ts packages/generators/src/generate.ts packages/generators/src/generate.test.ts
git commit -m "feat(generators): add patterned (maska tokens) + handle kinds"
```

---

### Task 2: Add the new semantic types to the frontend vocabulary

**Files:**

- Modify: `packages/schemas/src/ai.ts:25-46` (`SEMANTIC_TYPES`) and `:57-111` (`SEMANTIC_ALIASES`)
- Test: `packages/schemas/src/ai.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `ai.test.ts` inside `describe('normalizeSemanticType', ...)`:

```ts
it('maps the new identifier/alias spellings', () => {
  expect(normalizeSemanticType('ein')).toBe('taxId')
  expect(normalizeSemanticType('EIN')).toBe('taxId')
  expect(normalizeSemanticType('tax-id')).toBe('taxId')
  expect(normalizeSemanticType('ssn')).toBe('ssn')
  expect(normalizeSemanticType('social-security-number')).toBe('ssn')
  expect(normalizeSemanticType('handle')).toBe('username')
  expect(normalizeSemanticType('nickname')).toBe('username')
  expect(normalizeSemanticType('masked')).toBe('masked')
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/schemas test`
Expected: FAIL — these currently resolve to `'unknown'`.

- [ ] **Step 3: Add the types**

In `SEMANTIC_TYPES` (ai.ts), insert before `'unknown'`:

```ts
  'notes',
  'taxId',
  'ssn',
  'username',
  'masked',
  'unknown',
] as const
```

- [ ] **Step 4: Add the aliases**

In `SEMANTIC_ALIASES` (ai.ts), before the closing `}` (line 111), add:

```ts
  ein: 'taxId',
  fein: 'taxId',
  taxid: 'taxId',
  employeridentificationnumber: 'taxId',
  socialsecurity: 'ssn',
  socialsecuritynumber: 'ssn',
  handle: 'username',
  nickname: 'username',
  screenname: 'username',
  displayname: 'username',
  alias: 'username',
```

(Note: `ssn`, `username`, `masked`, `taxid`→`taxId` already collapse via the squashed-canonical map; the explicit aliases cover the spellings that don't.)

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @quikfill/schemas test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/ai.ts packages/schemas/src/ai.test.ts
git commit -m "feat(schemas): add taxId/ssn/username/masked to the AI vocabulary"
```

---

### Task 3: Map the new types to generators + classify them

**Files:**

- Modify: `packages/autofill-core/src/classify.ts`
- Test: `packages/autofill-core/src/classify.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `classify.test.ts` (define a local field factory if the file lacks one):

```ts
function field(partial: Partial<DetectedField> & { id?: string }): DetectedField {
  return {
    id: 'f1',
    tagName: 'input',
    inputType: 'text',
    required: false,
    disabled: false,
    readonly: false,
    visible: true,
    classNames: [],
    selectorCandidates: [],
    domFingerprint: 'fp',
    frame: 'main',
    shadow: false,
    ...partial,
  }
}

describe('classifyField — new coverage', () => {
  it('classifies an EIN field as taxId with an EIN format', () => {
    const c = classifyField(field({ labelText: 'EIN #' }))
    expect(c.semanticType).toBe('taxId')
    expect(c.suggestedKind).toBe('patterned')
    expect(c.generatorOptions).toEqual({ format: '##-#######' })
  })
  it('classifies an alias field as username', () => {
    expect(classifyField(field({ labelText: 'Messaging Alias' })).semanticType).toBe('username')
  })
  it('falls back to masked for a masked field with no keyword match, carrying the format', () => {
    const c = classifyField(field({ labelText: 'Reference', mask: '##-####' }))
    expect(c.semanticType).toBe('masked')
    expect(c.suggestedKind).toBe('patterned')
    expect(c.generatorOptions).toEqual({ format: '##-####' })
  })
})
```

(Ensure `import type { DetectedField } from '@quikfill/schemas'` and `classifyField` are imported at the top of the test.)

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/autofill-core test`
Expected: FAIL — EIN→`number`/`unknown`, no `masked`.

- [ ] **Step 3: Add the generator mappings**

In `classify.ts`, add to `KIND_BY_SEMANTIC` (after `notes`, line 35):

```ts
    notes: { kind: 'notes' },
    taxId: { kind: 'patterned', options: { format: '##-#######' } },
    ssn: { kind: 'patterned', options: { format: '###-##-####' } },
    username: { kind: 'handle' },
    masked: { kind: 'patterned' },
  }
```

- [ ] **Step 4: Add keyword rules (specific-first) before the generic `number` rule**

In `KEYWORD_RULES`, insert before the `number` entry (line 84):

```ts
  { semanticType: 'ssn', re: /\bssn\b|social.?security/, confidence: 0.85 },
  { semanticType: 'taxId', re: /\bein\b|\bfein\b|employer id|tax.?id/, confidence: 0.8 },
  { semanticType: 'username', re: /user.?name|\bhandle\b|nickname|screen.?name|display.?name|\balias\b/, confidence: 0.7 },
  { semanticType: 'number', re: /number|\bqty\b|quantity|\bcounts?\b/, confidence: 0.65 },
```

- [ ] **Step 5: Add the masked fallback in `classifyField`**

In `classifyField`, after the `KEYWORD_RULES` loop and before `if (type === 'number')` (line 132), add:

```ts
if (field.mask) {
  return {
    fieldId: field.id,
    semanticType: 'masked',
    confidence: 0.7,
    suggestedKind: 'patterned',
    generatorOptions: { format: field.mask },
  }
}
```

- [ ] **Step 6: Run — expect pass**

Run: `pnpm --filter @quikfill/autofill-core test && pnpm --filter @quikfill/autofill-core typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/autofill-core/src/classify.ts packages/autofill-core/src/classify.test.ts
git commit -m "feat(autofill-core): classify taxId/ssn/username + masked fallback"
```

> Note: `generatorRuleForSemanticType('masked')` returns `{ kind: 'patterned' }` with no format (the per-field format isn't recoverable from the key alone). Rehydrated saved `masked` mappings therefore fall back to the `patterned` default (`########`). Acceptable for v1; fixed-format `taxId`/`ssn` rehydrate exactly.

---

### Task 4: Capture the input mask at scan time

**Files:**

- Modify: `packages/schemas/src/detected-field.ts:80`
- Modify: `packages/form-scanner/src/mask.ts:35`
- Modify: `packages/form-scanner/src/scan.ts` (imports + `buildField`, ~line 272)
- Test: `packages/form-scanner/src/mask.test.ts` (new)

- [ ] **Step 1: Write failing test for the mask helper**

Create `packages/form-scanner/src/mask.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getMaskPattern } from './mask'

describe('getMaskPattern', () => {
  it('reads a data-maska pattern off an element', () => {
    const el = document.createElement('input')
    el.setAttribute('data-maska', '##-#######')
    expect(getMaskPattern(el)).toBe('##-#######')
  })
  it('returns undefined when there is no mask', () => {
    expect(getMaskPattern(document.createElement('input'))).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/form-scanner test`
Expected: FAIL — `getMaskPattern` is not exported.

- [ ] **Step 3: Add `mask` to the schema**

In `packages/schemas/src/detected-field.ts`, after the `autocompleteHint` block (line 80):

```ts
  autocompleteHint: z.enum(['googlePlaces']).optional(),
  /** The field's input-mask pattern (maska `data-maska`), if any — drives the `masked` generator. */
  mask: z.string().optional(),
```

- [ ] **Step 4: Export the helper**

In `packages/form-scanner/src/mask.ts`, after `getMaskSpec` (line 35):

```ts
/** The raw maska pattern string for an element, if any (for scan-time capture). */
export function getMaskPattern(el: Element): string | undefined {
  return getMaskSpec(el)?.pattern
}
```

- [ ] **Step 5: Populate it during scan**

In `packages/form-scanner/src/scan.ts`, add `getMaskPattern` to the import from `'./extract'`? No — it's in `'./mask'`. Add a new import near line 31:

```ts
import { getMaskPattern } from './mask'
```

Then in `buildField` (in the returned object, after `autocompleteHint: detectAutocomplete(el),` ~line 292):

```ts
    autocompleteHint: detectAutocomplete(el),
    mask: getMaskPattern(el),
```

- [ ] **Step 6: Run — expect pass**

Run: `pnpm --filter @quikfill/form-scanner test && pnpm --filter @quikfill/schemas typecheck && pnpm --filter @quikfill/form-scanner typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/detected-field.ts packages/form-scanner/src/mask.ts packages/form-scanner/src/mask.test.ts packages/form-scanner/src/scan.ts
git commit -m "feat(form-scanner): capture data-maska mask onto DetectedField"
```

---

### Task 5: Add the vocabulary to the backend (lockstep)

**Files:** (in `quikfill-services`)

- Modify: `src/modules/ai/domain/semantic-types.ts:13-34` (`SEMANTIC_TYPES`) and `:48-102` (`ALIASES`)
- Test: `src/modules/ai/domain/ai-suggestion.spec.ts`

- [ ] **Step 1: Write failing test**

In `ai-suggestion.spec.ts`, add a case:

```ts
it('normalizes the new identifier aliases', () => {
  const out = parseAiSuggestions([
    { fieldId: 'f1', semanticType: 'ein', confidence: 0.9 },
    { fieldId: 'f2', semanticType: 'social-security-number', confidence: 0.9 },
    { fieldId: 'f3', semanticType: 'handle', confidence: 0.9 },
  ])
  expect(out.map((s) => s.semanticType)).toEqual(['taxId', 'ssn', 'username'])
})
```

- [ ] **Step 2: Run — expect fail**

Run (from `services/`): `npm test -- ai-suggestion`
Expected: FAIL — currently `'unknown'`.

- [ ] **Step 3: Add the types + aliases**

In `semantic-types.ts`, add before `'unknown'` in `SEMANTIC_TYPES`:

```ts
  'notes',
  'taxId',
  'ssn',
  'username',
  'masked',
  'unknown',
] as const;
```

And in `ALIASES`, before the closing `}` (line 102):

```ts
  ein: 'taxId',
  fein: 'taxId',
  taxid: 'taxId',
  employeridentificationnumber: 'taxId',
  socialsecurity: 'ssn',
  socialsecuritynumber: 'ssn',
  handle: 'username',
  nickname: 'username',
  screenname: 'username',
  displayname: 'username',
  alias: 'username',
```

- [ ] **Step 4: Run — expect pass**

Run (from `services/`): `npm test -- ai-suggestion`
Expected: PASS. (The Gemini prompt rule + `responseSchema` enum derive from `SEMANTIC_TYPES`, so the model now sees the new types automatically.)

- [ ] **Step 5: Check the backend generator-kind enum (if any)**

The frontend `generatorKindSchema` comment says it "Mirrors the backend GeneratorRule.kind." Confirm whether the backend validates a generator-kind enum that needs the two new kinds:

Run (from `services/`): `grep -rn "patterned\|customEnum\|generatorKind\|GeneratorRule" src/modules | grep -i kind`

If a kind enum exists (e.g. in a generators/presets DTO), add `'patterned'` and `'handle'` to it and update its spec the same way. If none exists (mappings persist `fillSource.ruleKey` as a free string, not a kind), no change is needed — note that in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/domain/semantic-types.ts src/modules/ai/domain/ai-suggestion.spec.ts
git commit -m "feat(ai): add taxId/ssn/username/masked to the semantic vocabulary (lockstep with frontend)"
```

---

### Task 6: Cross-repo gates + push

- [ ] **Step 1: Frontend gate**

Run (from `frontend/`): `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: all green (contract test in `schemas/src/ai.test.ts` agrees with the new vocabulary).

- [ ] **Step 2: Backend gate**

Run (from `services/`): `npm run verify`
Expected: green (lint, typecheck, unit, build, OpenAPI snapshot — semantic types are internal, so the OpenAPI snapshot should be unchanged; if `check:openapi` flags drift, run `npm run export-openapi` and include `openapi.json`).

- [ ] **Step 3: Push both repos** (lockstep — push frontend and services together)

```bash
# frontend
git -C /Users/kole/workspace/quikfill/frontend push origin HEAD:main
# services
git -C /Users/kole/workspace/quikfill/services push origin HEAD:main
```

## Self-Review

- **Spec coverage (Part 2):** new types → Tasks 2 + 5; generators → Task 1; classify mapping + masked fallback → Task 3; mask plumbing → Task 4; lockstep + contract tests → Tasks 2/5/6. ✓
- **Placeholders:** none — Task 5 Step 5 is a real discovery step with a concrete grep + defined edit, not a TODO.
- **Type consistency:** `patterned`/`handle` added to `generatorKindSchema` (Task 1) match the `GENERATORS` implementations (Task 1) and the `KIND_BY_SEMANTIC` kinds (Task 3); `mask` added to the schema (Task 4) matches `field.mask` read in `classifyField` (Task 3) and written in `buildField` (Task 4); the four new `SEMANTIC_TYPES` are identical in frontend (Task 2) and backend (Task 5).
- **Ordering note:** land Task 4 (mask schema) and Task 3 (reads `field.mask`) before relying on masked classification end-to-end; both are in this plan and gated together in Task 6.
