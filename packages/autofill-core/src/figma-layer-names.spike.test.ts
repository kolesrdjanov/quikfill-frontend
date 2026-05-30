import { describe, it, expect } from 'vitest'
import { detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { classifyField } from './classify'

/**
 * R2 decision-gate spike for the Figma plugin (docs/FIGMA_PLUGIN_PLAN.md).
 *
 * A Figma layer can only supply a NAME — no `autocomplete`, no real `inputType`,
 * no `name`/`domId`/DOM context. So every high-confidence path in `classifyField`
 * is dead and classification collapses to the keyword regex over `labelText`.
 * This fixture feeds realistic Figma layer names through the REAL classifier to
 * measure whether that residual signal is good enough to build on.
 *
 * Crucial mapping detail the original brief got wrong: the layer name must be
 * routed into `labelText` (there is no `label` field, and `classifyField` reads
 * only `[name, domId, labelText, placeholder, ariaLabel]`). Route it anywhere
 * else and the gate fails artificially with zero signal.
 *
 * Exact rates depend on corpus composition — the gate needs a real, named corpus.
 * The thresholds below encode the headline finding: form vocabulary classifies
 * well, generic dashboard/table vocabulary mostly does not (bimodal).
 */

/** Build a DetectedField exactly as a correct `figma-adapter` would: name → labelText. */
function makeFigmaField(layerName: string): DetectedField {
  return detectedFieldSchema.parse({
    id: `fig-${layerName}`,
    tagName: 'input',
    inputType: 'text', // Figma has no input types
    domFingerprint: `fp-${layerName}`,
    labelText: layerName, // the only signal a layer name can carry
  })
}

function semanticOf(layerName: string): string {
  return classifyField(makeFigmaField(layerName)).semanticType
}

/** Corpus of names that *should* map, paired with the semantically-expected type. */
const FORMS_CORPUS: ReadonlyArray<readonly [string, string]> = [
  ['Email', 'email'],
  ['Email address', 'email'],
  ['First name', 'person.firstName'],
  ['First Name', 'person.firstName'],
  ['Last name', 'person.lastName'],
  ['Full name', 'person.fullName'],
  ['Your name', 'person.fullName'],
  ['Phone', 'phone'],
  ['Phone number', 'phone'],
  ['Mobile', 'phone'],
  ['Company', 'company'],
  ['Employer', 'company'],
  ['Address', 'address.line1'],
  ['Street address', 'address.line1'],
  ['Address line 1', 'address.line1'],
  ['City', 'address.city'],
  ['State', 'address.state'],
  ['ZIP', 'address.zip'],
  ['Zip code', 'address.zip'],
  ['Postal code', 'address.zip'],
  ['Country', 'address.country'],
  ['Website', 'url'],
  ['Bio', 'notes'],
  ['Message', 'notes'],
  ['Comment', 'notes'],
  ['Date of birth', 'date'],
  ['Birthday', 'date'],
  ['Price', 'currency'],
  ['Amount', 'currency'],
  ['Quantity', 'number'],
]

/** Generic dashboard/table column vocabulary — much of it has no generator at all. */
const DASHBOARD_DATA_CORPUS: readonly string[] = [
  'Status',
  'Role',
  'Username',
  'Handle',
  'Revenue',
  'Total',
  'Created',
  'Updated',
  'Owner',
  'Progress',
  'Tags',
  'Type',
  'Plan',
  'Stage',
  'Priority',
  'Assignee',
  'Department',
  'Balance',
  'Score',
  'Region',
]

/** Pure decoration / structural layer names that must NEVER produce a fill. */
const DECORATION_CORPUS: readonly string[] = [
  'Text',
  'Label',
  'Title',
  'Heading',
  'Subheading',
  'Body text',
  'Card title',
  'CTA',
  'Button',
  'Avatar',
  'Rectangle 47',
  'Frame 12',
  'Group 3',
  'Ellipse',
  'Icon',
  'Placeholder',
  'Caption',
]

function recallOf(names: readonly string[]): number {
  const hits = names.filter((n) => semanticOf(n) !== 'unknown').length
  return hits / names.length
}

describe('Figma layer-name classification spike (R2 gate)', () => {
  it('forms corpus: high recall AND precision on form vocabulary', () => {
    let recallHits = 0
    let precisionHits = 0
    const misses: string[] = []
    for (const [name, expected] of FORMS_CORPUS) {
      const got = semanticOf(name)
      if (got !== 'unknown') recallHits++
      if (got === expected) precisionHits++
      else misses.push(`${name} → ${got} (expected ${expected})`)
    }
    const recall = recallHits / FORMS_CORPUS.length
    const precision = precisionHits / FORMS_CORPUS.length
    // Surfaced in `--reporter verbose` so the gate is auditable, not just pass/fail.
    console.info(
      `[R2] forms: recall=${(recall * 100).toFixed(0)}% precision=${(precision * 100).toFixed(0)}%` +
        (misses.length ? ` misses=${JSON.stringify(misses)}` : ''),
    )
    expect(recall).toBeGreaterThanOrEqual(0.85)
    expect(precision).toBeGreaterThanOrEqual(0.85)
  })

  it('dashboard/table corpus: materially lower recall (the bimodal finding)', () => {
    const formsRecall = recallOf(FORMS_CORPUS.map(([n]) => n))
    const dashRecall = recallOf(DASHBOARD_DATA_CORPUS)
    console.info(
      `[R2] dashboard recall=${(dashRecall * 100).toFixed(0)}% vs forms recall=${(formsRecall * 100).toFixed(0)}%`,
    )
    // Generic column vocabulary mostly misses — do NOT scope arbitrary dashboards for v1.
    expect(dashRecall).toBeLessThanOrEqual(0.5)
    expect(formsRecall - dashRecall).toBeGreaterThanOrEqual(0.3)
  })

  it('decoration layers produce zero false fills (a good property)', () => {
    const falsePositives = DECORATION_CORPUS.filter((n) => semanticOf(n) !== 'unknown')
    expect(falsePositives).toEqual([])
  })

  // classify.ts was tightened to use word-boundary keywords, so these substring
  // false-positives are now fixed (see classify-precision.test.ts for the
  // canonical regression tests + the legitimate count/date fields still matching).
  describe('classifier precision (fixed with word-boundary keywords)', () => {
    it('"Discount" and "County" are no longer mis-classified as number', () => {
      expect(semanticOf('Discount')).not.toBe('number')
      expect(semanticOf('County')).not.toBe('number')
    })

    it('"Updated" and "Created" are now treated consistently (no date-by-substring)', () => {
      expect(semanticOf('Updated')).toBe('unknown')
      expect(semanticOf('Created')).toBe('unknown')
    })
  })
})
