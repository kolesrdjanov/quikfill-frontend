import type { FillSource, GeneratorRule } from '@quikfill/schemas'
import { runGenerator } from '@quikfill/generators'

export interface ResolveContext {
  seed?: string | number
  locale?: string
  /** Generator rules keyed by `generatorRule.ruleKey`. */
  rules?: Record<string, GeneratorRule>
  /** Saved entity-record values keyed by recordId (Iteration 6+). */
  records?: Record<string, Record<string, unknown>>
  /** Options of the field currently being resolved (for selectOption). */
  fieldOptions?: string[]
}

export interface ResolvedValue {
  value: string | null
  warnings: string[]
  requiresConfirmation: boolean
}

/** Resolve a FillSource to a concrete proposed value (or null if it needs input). */
export function resolveFillSource(source: FillSource, ctx: ResolveContext = {}): ResolvedValue {
  switch (source.sourceType) {
    case 'staticValue':
      return ok(source.value)

    case 'generatorRule': {
      const rule = ctx.rules?.[source.ruleKey]
      if (!rule) return fail(`No generator rule "${source.ruleKey}" available.`)
      return ok(
        runGenerator(rule, { seed: ctx.seed, locale: ctx.locale, fieldOptions: ctx.fieldOptions }),
      )
    }

    case 'recordField': {
      const values = source.recordId ? ctx.records?.[source.recordId] : undefined
      const value = values?.[source.fieldKey]
      if (value == null) return fail('No saved record value for this field yet.')
      return ok(String(value))
    }

    case 'runtimeValue':
      return needsInput(`Needs input: ${source.promptLabel}`)

    case 'aiGenerated':
      return needsInput('AI suggestion not generated yet (Iteration 7).')

    case 'composed': {
      const parts = source.parts.map((p) => resolveFillSource(p, ctx))
      const warnings = parts.flatMap((p) => p.warnings)
      if (parts.some((p) => p.value == null)) {
        return { value: null, warnings, requiresConfirmation: true }
      }
      const values = parts.map((p) => p.value as string)
      const composed = applyTemplate(source.template, values)
      return {
        value: composed,
        warnings,
        requiresConfirmation: parts.some((p) => p.requiresConfirmation),
      }
    }
  }
}

function applyTemplate(template: string, values: string[]): string {
  if (/\{\d+\}/.test(template)) {
    return template.replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '')
  }
  return values.join(' ')
}

const ok = (value: string): ResolvedValue => ({ value, warnings: [], requiresConfirmation: false })
const fail = (warning: string): ResolvedValue => ({
  value: null,
  warnings: [warning],
  requiresConfirmation: true,
})
const needsInput = (warning: string): ResolvedValue => ({
  value: null,
  warnings: [warning],
  requiresConfirmation: true,
})
