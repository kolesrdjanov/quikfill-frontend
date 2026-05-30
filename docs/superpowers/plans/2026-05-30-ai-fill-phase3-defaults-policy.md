# AI Fill Experience — Phase 3: Defaults & Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make values appear by default for ordinary fields, centralize fill-source selection so every path honors the preference, and never auto-fill a fake sensitive identifier (SSN/EIN).

**Architecture:** Introduce a single `defaultSourceFor` policy in `@quikfill/autofill-core` plus a `SENSITIVE_SEMANTIC_TYPES` set; route `buildPreviewPlan` and `suggestionToProposal` through it (fixing the base plan that currently samples regardless of the setting); flip the default `defaultFillSource` to `hybrid`; pass the preference + saved-record index into the base plan from the side panel.

**Tech Stack:** TypeScript, Zod, Vitest, Vue 3 composable.

Spec: [docs/superpowers/specs/2026-05-30-ai-fill-experience-design.md](../specs/2026-05-30-ai-fill-experience-design.md) (Part 3). **Depends on Phase 2** (the sensitive set references `taxId`/`ssn`).

---

## File Structure

- `packages/autofill-core/src/source-policy.ts` — **new**: `SENSITIVE_SEMANTIC_TYPES`, `isSensitiveSemanticType`, `defaultSourceFor`.
- `packages/autofill-core/src/source-policy.test.ts` — **new**: the policy matrix.
- `packages/autofill-core/src/index.ts` — export the new symbols.
- `packages/autofill-core/src/plan.ts` — `buildPreviewPlan` routes the no-mapping branch through `defaultSourceFor`; `PreviewOptions` gains `allowSampleData` + `recordIndex`.
- `packages/autofill-core/src/plan.test.ts` — update the existing preview test + add gating tests.
- `packages/ai/src/proposal.ts` — `suggestionToProposal` uses `defaultSourceFor` (adds the sensitive carve-out).
- `packages/ai/src/proposal.test.ts` — add a sensitive-type test.
- `packages/schemas/src/extension-settings.ts` — default `defaultFillSource: 'hybrid'`.
- `packages/schemas/src/extension-settings.test.ts` — **new**: assert the default.
- `apps/chrome-extension/lib/useFillSession.ts` — pass `allowSampleData` + `recordIndex` to `buildPreviewPlan`.

---

### Task 1: Source-selection policy + sensitive set

**Files:**

- Create: `packages/autofill-core/src/source-policy.ts`
- Create: `packages/autofill-core/src/source-policy.test.ts`
- Modify: `packages/autofill-core/src/index.ts`

- [ ] **Step 1: Write the failing test (the policy matrix)**

Create `packages/autofill-core/src/source-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GeneratorRule } from '@quikfill/schemas'
import { defaultSourceFor, isSensitiveSemanticType } from './source-policy'

const genRule = (key: string): GeneratorRule => ({ fieldKey: key, kind: 'patterned' })
const match = { entityTypeId: 'identity', recordId: 'r1', fieldKey: 'email' }

describe('isSensitiveSemanticType', () => {
  it('flags ssn and taxId, not ordinary types', () => {
    expect(isSensitiveSemanticType('ssn')).toBe(true)
    expect(isSensitiveSemanticType('taxId')).toBe(true)
    expect(isSensitiveSemanticType('email')).toBe(false)
  })
})

describe('defaultSourceFor', () => {
  it('prefers a saved record over everything', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: true,
      recordMatch: match,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource.sourceType).toBe('recordField')
    expect(r.rule).toBeNull()
  })
  it('samples an ordinary type when sample data is allowed', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: true,
      recordMatch: null,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource).toEqual({ sourceType: 'generatorRule', ruleKey: 'email' })
    expect(r.rule).toEqual(genRule('email'))
  })
  it('never samples a sensitive type — leaves it for the user', () => {
    const r = defaultSourceFor({
      semanticType: 'ssn',
      allowSampleData: true,
      recordMatch: null,
      generatorRule: genRule('ssn'),
    })
    expect(r.fillSource).toEqual({ sourceType: 'aiGenerated', hint: 'ssn' })
    expect(r.rule).toBeNull()
  })
  it('leaves an ordinary type for the user when sample data is off', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: false,
      recordMatch: null,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource.sourceType).toBe('aiGenerated')
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/autofill-core test`
Expected: FAIL — `./source-policy` does not exist.

- [ ] **Step 3: Implement the policy**

Create `packages/autofill-core/src/source-policy.ts`:

```ts
import type { FillSource, GeneratorRule } from '@quikfill/schemas'
import type { RecordMatch } from './record-index'

/**
 * Semantic types we recognize but never fabricate a fake value for. They are
 * recognized (so a saved value fills, and the user can sample one on demand via
 * the source pill), but the default never proposes synthetic data for them.
 */
export const SENSITIVE_SEMANTIC_TYPES: ReadonlySet<string> = new Set(['ssn', 'taxId'])

export function isSensitiveSemanticType(semanticType: string): boolean {
  return SENSITIVE_SEMANTIC_TYPES.has(semanticType)
}

export interface SourcePolicyInput {
  semanticType: string
  /** Whether the active preference permits synthetic sample data. */
  allowSampleData: boolean
  /** A matched saved record for this semantic type, if any. */
  recordMatch?: RecordMatch | null
  /** The generator rule to use if sampling is chosen (may carry per-field options). */
  generatorRule: GeneratorRule | null
}

/**
 * The single place that decides a field's default fill source: saved data wins;
 * otherwise sample data only when allowed AND the type is not sensitive AND a
 * generator exists; otherwise an `aiGenerated` placeholder ("needs a value").
 */
export function defaultSourceFor(input: SourcePolicyInput): {
  fillSource: FillSource
  rule: GeneratorRule | null
} {
  const { semanticType, allowSampleData, recordMatch, generatorRule } = input
  if (recordMatch) {
    return {
      fillSource: {
        sourceType: 'recordField',
        entityTypeId: recordMatch.entityTypeId,
        recordId: recordMatch.recordId,
        fieldKey: recordMatch.fieldKey,
      },
      rule: null,
    }
  }
  if (allowSampleData && !isSensitiveSemanticType(semanticType) && generatorRule) {
    return {
      fillSource: { sourceType: 'generatorRule', ruleKey: generatorRule.fieldKey },
      rule: generatorRule,
    }
  }
  return { fillSource: { sourceType: 'aiGenerated', hint: semanticType }, rule: null }
}
```

- [ ] **Step 4: Export from the package index**

In `packages/autofill-core/src/index.ts`, add:

```ts
export {
  defaultSourceFor,
  isSensitiveSemanticType,
  SENSITIVE_SEMANTIC_TYPES,
  type SourcePolicyInput,
} from './source-policy'
```

> If `RecordMatch` is not exported from `./record-index`, import it from wherever it is defined (it is the return type of `recordMatchForSemanticType`); confirm with `grep -rn "interface RecordMatch\|type RecordMatch" packages/autofill-core/src`.

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @quikfill/autofill-core test && pnpm --filter @quikfill/autofill-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/autofill-core/src/source-policy.ts packages/autofill-core/src/source-policy.test.ts packages/autofill-core/src/index.ts
git commit -m "feat(autofill-core): central source-selection policy + sensitive carve-out"
```

---

### Task 2: Route `buildPreviewPlan` through the policy

**Files:**

- Modify: `packages/autofill-core/src/plan.ts` (imports, `PreviewOptions`, the no-mapping branch ~lines 103-121)
- Modify: `packages/autofill-core/src/plan.test.ts:117,128` + add gating tests

- [ ] **Step 1: Update the existing preview test (it now must opt in to samples)**

In `plan.test.ts`, the `buildPreviewPlan` test calls `buildPreviewPlan(fields, { seed: 'seed-1' })` and expects sample values. Change BOTH calls (lines 117 and 128) to opt in:

```ts
const plan = buildPreviewPlan(fields, { seed: 'seed-1', allowSampleData: true })
```

```ts
const again = buildPreviewPlan(fields, { seed: 'seed-1', allowSampleData: true })
```

- [ ] **Step 2: Add gating tests**

Append to the `describe('buildPreviewPlan', …)` block:

```ts
it('leaves classified fields for the user when sample data is off (no silent samples)', () => {
  const plan = buildPreviewPlan([field({ id: 'email', name: 'email', inputType: 'email' })], {
    seed: 's',
    allowSampleData: false,
  })
  expect(plan.items[0].fillSource.sourceType).toBe('aiGenerated')
  expect(plan.items[0].proposedValue).toBe('')
})

it('never auto-samples a sensitive type even with sample data on', () => {
  const plan = buildPreviewPlan([field({ id: 't', name: 'ein', labelText: 'EIN #' })], {
    seed: 's',
    allowSampleData: true,
  })
  expect(plan.items[0].fillSource.sourceType).toBe('aiGenerated')
})
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm --filter @quikfill/autofill-core test`
Expected: FAIL — `buildPreviewPlan` still always samples and ignores `allowSampleData`.

- [ ] **Step 4: Refactor `buildPreviewPlan`**

In `plan.ts`, update imports (lines 10-11):

```ts
import { classifyFields, generatorRuleForSemanticType } from './classify'
import { resolveFillSource, type ResolveContext } from './resolve'
import { defaultSourceFor } from './source-policy'
import { recordMatchForSemanticType, type RecordIndex } from './record-index'
```

Extend `PreviewOptions` (after `records`, line 74):

```ts
  /** Saved entity-record values (recordId → values) for `recordField` sources. */
  records?: Record<string, Record<string, unknown>>
  /** Whether the active preference permits synthetic sample data (default false). */
  allowSampleData?: boolean
  /** Saved-record index, so the default can prefer a real saved value. */
  recordIndex?: RecordIndex
```

Replace the no-saved-mapping branch (current lines 103-121, the `const c = byId.get(field.id) … } else { … }` block) with:

```ts
const c = byId.get(field.id)
const semanticType = c?.semanticType ?? 'unknown'
const generatorRule = c?.suggestedKind
  ? { fieldKey: semanticType, kind: c.suggestedKind, options: c.generatorOptions }
  : null
const recordMatch = opts.recordIndex
  ? recordMatchForSemanticType(opts.recordIndex, semanticType)
  : null
const { fillSource, rule } = defaultSourceFor({
  semanticType,
  allowSampleData: opts.allowSampleData ?? false,
  recordMatch,
  generatorRule,
})
if (rule) rules[semanticType] = rule
assignments.push({ field, fillSource, confidence: c?.confidence ?? 0.2 })
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @quikfill/autofill-core test && pnpm --filter @quikfill/autofill-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/autofill-core/src/plan.ts packages/autofill-core/src/plan.test.ts
git commit -m "fix(autofill-core): base plan honors the sample-data preference (no silent samples)"
```

---

### Task 3: Apply the carve-out on the AI proposal path

**Files:**

- Modify: `packages/ai/src/proposal.ts:62-83`
- Modify: `packages/ai/src/proposal.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `proposal.test.ts` (mirror the file's existing imports; `detectedFieldSchema` from `@quikfill/schemas`):

```ts
it('never samples a sensitive type, even when sample data is allowed', () => {
  const field = detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    id: 'f1',
  })
  const suggestion = { fieldId: 'f1', semanticType: 'ssn' as const, confidence: 0.9, reasons: [] }
  const p = suggestionToProposal(suggestion, field, null, { allowSampleData: true })
  expect(p.fillSource.sourceType).toBe('aiGenerated')
  expect(p.generatorRule).toBeNull()
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/ai test`
Expected: FAIL — `ssn` currently maps to a generator when `allowSampleData` is true.

- [ ] **Step 3: Route the non-record branch through `defaultSourceFor`**

In `proposal.ts`, update the import (line 1-5) to add `defaultSourceFor`:

```ts
import {
  defaultFillStrategy,
  defaultSourceFor,
  generatorRuleForSemanticType,
  type RecordMatch,
} from '@quikfill/autofill-core'
```

Replace the body after `const base = { … }` (lines 55-82) so both branches go through the policy:

```ts
const generatorRule = options.allowSampleData
  ? generatorRuleForSemanticType(suggestion.semanticType)
  : null
const { fillSource, rule } = defaultSourceFor({
  semanticType: suggestion.semanticType,
  allowSampleData: !!options.allowSampleData,
  recordMatch,
  generatorRule,
})
return { ...base, fillSource, generatorRule: rule }
```

(Remove the old `if (recordMatch) { … }` block and the inline `fillSource`/`generatorRule` construction — `defaultSourceFor` now owns all three outcomes: record → sample → placeholder.)

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @quikfill/ai test && pnpm --filter @quikfill/ai typecheck`
Expected: PASS (existing "opts in" and "unknown stays aiGenerated" tests still pass — non-sensitive behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/proposal.ts packages/ai/src/proposal.test.ts
git commit -m "feat(ai): route proposals through the source policy (sensitive carve-out)"
```

---

### Task 4: Flip the default to `hybrid`

**Files:**

- Modify: `packages/schemas/src/extension-settings.ts:47`
- Create: `packages/schemas/src/extension-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/schemas/src/extension-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS, allowsSampleData } from './extension-settings'

describe('DEFAULT_EXTENSION_SETTINGS', () => {
  it('defaults to hybrid so ordinary fields get values out of the box', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.defaultFillSource).toBe('hybrid')
    expect(allowsSampleData(DEFAULT_EXTENSION_SETTINGS.defaultFillSource)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @quikfill/schemas test`
Expected: FAIL — default is `recordField`.

- [ ] **Step 3: Flip the default**

In `extension-settings.ts`, line 47:

```ts
  defaultFillSource: 'hybrid',
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @quikfill/schemas test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/extension-settings.ts packages/schemas/src/extension-settings.test.ts
git commit -m "feat(schemas): default fill source to hybrid (values out of the box)"
```

---

### Task 5: Feed the preference + records into the base plan

**Files:**

- Modify: `apps/chrome-extension/lib/useFillSession.ts:338-347` (`rebuildPlan`)

- [ ] **Step 1: Pass `allowSampleData` + `recordIndex` to `buildPreviewPlan`**

In `useFillSession.ts`, in `rebuildPlan` (lines 338-347), extend the options object:

```ts
function rebuildPlan() {
  planItems.value = applyAiOverrides(
    buildPreviewPlan(fields.value, {
      seed: seed.value,
      locale: locale.value,
      savedMappings: savedMappings.value,
      records: recordValues.value,
      allowSampleData: allowSampleData.value,
      recordIndex: recordIndex.value,
    }).items,
  )
}
```

(`allowSampleData` and `recordIndex` are already defined refs in this composable; no new imports needed beyond the existing `buildPreviewPlan`.)

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build`
Expected: PASS; `✔ Built extension`.

- [ ] **Step 3: Manual verification (side panel)**

Load the unpacked extension. On a form with ordinary fields (name/email) and an EIN field, Scan → Preview:

- ordinary fields show a labeled **Sample** value (default is now hybrid),
- the EIN field shows **Needs a value** (sensitive — not auto-sampled),
- toggling Settings → fill source back to "only my saved data" and re-previewing shows no samples anywhere.

- [ ] **Step 4: Commit**

```bash
git add apps/chrome-extension/lib/useFillSession.ts
git commit -m "feat(ext): base preview honors the sample-data preference + saved records"
```

---

### Task 6: Gate + push

- [ ] **Step 1: Full gate**

Run (from `frontend/`): `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: all green.

- [ ] **Step 2: Push**

```bash
git push origin HEAD:main
```

## Self-Review

- **Spec coverage (Part 3):** default flip → Task 4; centralized policy → Tasks 1-3; fixes "base plan always samples" → Task 2; sensitive carve-out → Tasks 1 (set), 2 (base plan), 3 (AI path); wiring → Task 5. ✓
- **Placeholders:** none. The one conditional (Task 1 Step 4, `RecordMatch` import location) is a concrete grep with a defined action.
- **Type consistency:** `defaultSourceFor` signature (Task 1) is called identically in `plan.ts` (Task 2) and `proposal.ts` (Task 3); `PreviewOptions.allowSampleData`/`recordIndex` (Task 2) match the values passed from `useFillSession` (Task 5); the sensitive set uses `taxId`/`ssn` exactly as named in Phase 2's vocabulary.
- **Dependency:** this plan assumes Phase 2 has landed (the `taxId`/`ssn` types and `patterned` kind exist). Run Phase 2 first.
