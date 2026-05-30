import { describe, expect, it } from 'vitest'
import { detectedFieldSchema } from '@quikfill/schemas'
import { classifyField } from './classify'
import { FIGMA_R2_CORPUS, type Tier } from './figma-r2-corpus'

/**
 * Figma R2 decision gate (docs/FIGMA_PLUGIN_PLAN.md → "Decision gate").
 *
 * Runs the real `classifyField` over a labeled two-tier corpus of realistic
 * Figma layer names and measures, per tier:
 *   - recall        : of fields that SHOULD fill, the fraction we mapped to some type
 *   - typePrecision : of the fields we attempted, the fraction with the RIGHT type
 *   - noiseFP       : of non-fillable/decoration names, the fraction wrongly filled
 *
 * The classifier only ever sees the layer NAME (routed into labelText), exactly
 * as a Figma adapter would supply it — no autocomplete/inputType/DOM signals.
 */

/** Classify from the layer name alone (the only signal a Figma layer carries). */
function semanticOf(name: string): string {
  return classifyField(
    detectedFieldSchema.parse({
      id: name,
      tagName: 'input',
      inputType: 'text',
      domFingerprint: name,
      labelText: name,
    }),
  ).semanticType
}

interface Metrics {
  tier: Tier
  total: number
  fillable: number
  noise: number
  recall: number
  typePrecision: number
  noiseFp: number
}

function metricsFor(tier: Tier): Metrics {
  const entries = FIGMA_R2_CORPUS.filter((e) => e.tier === tier)
  const fillable = entries.filter((e) => e.expectedType !== 'unknown')
  const noise = entries.filter((e) => e.expectedType === 'unknown')
  const attempted = fillable.filter((e) => semanticOf(e.name) !== 'unknown')
  const typeCorrect = attempted.filter((e) => semanticOf(e.name) === e.expectedType)
  const noiseFilled = noise.filter((e) => semanticOf(e.name) !== 'unknown')
  return {
    tier,
    total: entries.length,
    fillable: fillable.length,
    noise: noise.length,
    recall: fillable.length ? attempted.length / fillable.length : 1,
    typePrecision: attempted.length ? typeCorrect.length / attempted.length : 1,
    noiseFp: noise.length ? noiseFilled.length / noise.length : 0,
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`

// ── Gate policy bars ──────────────────────────────────────────────────────
// Forms is the proposed v1 scope and must clear a useful bar on all three axes.
const BAR_FORMS_RECALL = 0.8
const BAR_FORMS_PRECISION = 0.85
const BAR_FORMS_NOISE_FP = 0.2
const BAR_DECORATION_FP = 0.05

describe('Figma R2 classifier gate (two-tier corpus)', () => {
  const forms = metricsFor('forms')
  const dashboard = metricsFor('dashboard')
  const decoration = metricsFor('decoration')

  it('reports the decision table', () => {
    for (const m of [forms, dashboard, decoration]) {
      console.info(
        `[R2] ${m.tier.padEnd(10)} n=${String(m.total).padStart(3)} fillable=${String(m.fillable).padStart(2)} | ` +
          `recall=${pct(m.recall).padStart(4)} typePrecision=${pct(m.typePrecision).padStart(4)} noiseFP=${pct(m.noiseFp).padStart(4)}`,
      )
    }
    expect(FIGMA_R2_CORPUS.length).toBeGreaterThanOrEqual(120)
  })

  it('FORMS tier clears the go bar (recall + type-precision, low false-fill)', () => {
    expect(forms.recall).toBeGreaterThanOrEqual(BAR_FORMS_RECALL)
    expect(forms.typePrecision).toBeGreaterThanOrEqual(BAR_FORMS_PRECISION)
    expect(forms.noiseFp).toBeLessThanOrEqual(BAR_FORMS_NOISE_FP)
  })

  it('DASHBOARD tier recalls materially worse than forms (bimodal → out of v1 scope)', () => {
    expect(dashboard.recall).toBeLessThan(forms.recall)
    expect(forms.recall - dashboard.recall).toBeGreaterThanOrEqual(0.2)
  })

  it('decoration layers are (almost) never false-filled', () => {
    expect(decoration.noiseFp).toBeLessThanOrEqual(BAR_DECORATION_FP)
  })
})
