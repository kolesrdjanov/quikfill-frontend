import type { GeneratorKind, GeneratorRule } from '@quikfill/schemas'
import {
  CITIES,
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  EMAIL_DOMAINS,
  FIRST_NAMES,
  LAST_NAMES,
  LOREM_WORDS,
  STATES,
  STREET_NAMES,
  STREET_SUFFIXES,
} from './data'
import { createRng, type Rng } from './rng'

export interface GenerateContext {
  /** When set, generation is deterministic (seeded mode). */
  seed?: string | number
  locale?: string
  /** Options available on the target field, used by `selectOption`. */
  fieldOptions?: string[]
}

type Options = Record<string, unknown>

function num(o: Options, key: string, fallback: number): number {
  const v = o[key]
  return typeof v === 'number' ? v : fallback
}
function str(o: Options, key: string): string | undefined {
  const v = o[key]
  return typeof v === 'string' ? v : undefined
}
function strArray(o: Options, key: string): string[] | undefined {
  const v = o[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined
}

/** Generate a single value for a rule. Deterministic when `ctx.seed` is set. */
export function runGenerator(rule: GeneratorRule, ctx: GenerateContext = {}): string {
  const o: Options = rule.options ?? {}
  const rng = createRng(ctx.seed, `${rule.fieldKey}:${rule.kind}`)
  return GENERATORS[rule.kind](rng, o, ctx)
}

const GENERATORS: Record<GeneratorKind, (rng: Rng, o: Options, ctx: GenerateContext) => string> = {
  person(rng, o) {
    const first = rng.pick(FIRST_NAMES)
    const last = rng.pick(LAST_NAMES)
    switch (str(o, 'part')) {
      case 'first':
        return first
      case 'last':
        return last
      default:
        return `${first} ${last}`
    }
  },
  email(rng, o) {
    const first = rng.pick(FIRST_NAMES).toLowerCase()
    const last = rng.pick(LAST_NAMES).toLowerCase()
    const domain = str(o, 'domain') ?? rng.pick(EMAIL_DOMAINS)
    return `${first}.${last}${rng.int(1, 999)}@${domain}`
  },
  phone(rng, o) {
    const template = str(o, 'format') ?? '+1-###-###-####'
    return template.replace(/#/g, () => String(rng.int(0, 9)))
  },
  address(rng, o) {
    switch (str(o, 'part')) {
      case 'city':
        return rng.pick(CITIES)
      case 'state':
        return rng.pick(STATES)
      case 'zip':
        return String(rng.int(10000, 99999))
      case 'country':
        return str(o, 'country') ?? 'US'
      default:
        return `${rng.int(1, 9999)} ${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIXES)}`
    }
  },
  company(rng) {
    return `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIXES)}`
  },
  unit(rng, o) {
    return `${str(o, 'prefix') ?? 'Apt'} ${rng.int(1, 999)}`
  },
  number(rng, o) {
    const min = num(o, 'min', 0)
    const max = num(o, 'max', 1000)
    const decimals = num(o, 'decimals', 0)
    const value = min + rng.next() * (max - min)
    return value.toFixed(decimals)
  },
  date(rng, o) {
    const min = Date.parse(str(o, 'min') ?? '') || Date.now() - 365 * 24 * 3600 * 1000
    const max = Date.parse(str(o, 'max') ?? '') || Date.now() + 365 * 24 * 3600 * 1000
    const ts = min + Math.floor(rng.next() * (max - min))
    return new Date(ts).toISOString().slice(0, 10)
  },
  currency(rng, o) {
    const symbol = str(o, 'symbol') ?? '$'
    const min = num(o, 'min', 1)
    const max = num(o, 'max', 10000)
    const value = (min + rng.next() * (max - min)).toFixed(2)
    return `${symbol}${value}`
  },
  boolean(rng, o) {
    const v = rng.bool()
    return v ? (str(o, 'trueValue') ?? 'true') : (str(o, 'falseValue') ?? 'false')
  },
  notes(rng, o) {
    const count = num(o, 'words', 8)
    const words = Array.from({ length: count }, () => rng.pick(LOREM_WORDS))
    const sentence = words.join(' ')
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.'
  },
  selectOption(rng, o, ctx) {
    const options = ctx.fieldOptions ?? strArray(o, 'options') ?? []
    return options.length ? rng.pick(options) : ''
  },
  customEnum(rng, o) {
    const values = strArray(o, 'values') ?? []
    return values.length ? rng.pick(values) : ''
  },
}
