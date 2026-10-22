import type { GeneratorKind, GeneratorRule } from '@quikfill/schemas'
import { COMPANY_PREFIXES, COMPANY_SUFFIXES, LOREM_WORDS, URL_TLDS } from './data'
import { createRng, type Rng } from './rng'
import { createSamplePersona, type SamplePersona } from './persona'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface GenerateContext {
  /** When set, generation is deterministic (seeded mode). */
  seed?: string | number
  locale?: string
  /** Options available on the target field, used by `selectOption`. */
  fieldOptions?: string[]
  /** Extra per-field discriminator so fields sharing a rule get distinct values. */
  salt?: string
  persona?: SamplePersona
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
  const rng = createRng(ctx.seed, `${rule.fieldKey}:${rule.kind}:${ctx.salt ?? ''}`)
  return GENERATORS[rule.kind](rng, o, {
    ...ctx,
    persona: ctx.persona ?? createSamplePersona(ctx.seed, ctx.locale),
  })
}

const GENERATORS: Record<GeneratorKind, (rng: Rng, o: Options, ctx: GenerateContext) => string> = {
  person(_rng, o, ctx) {
    const first = ctx.persona!.firstName
    const last = ctx.persona!.lastName
    switch (str(o, 'part')) {
      case 'first':
        return first
      case 'last':
        return last
      default:
        return `${first} ${last}`
    }
  },
  email(_rng, o, ctx) {
    const email = ctx.persona!.email
    return str(o, 'domain') ? email.replace(/@.*$/, `@${str(o, 'domain')}`) : email
  },
  phone(rng, o, ctx) {
    const template = str(o, 'format')
    if (!template) return ctx.persona!.phone
    return template.replace(/#/g, () => String(rng.int(0, 9)))
  },
  address(_rng, o, ctx) {
    switch (str(o, 'part')) {
      case 'city':
        return ctx.persona!.city
      case 'state':
        return ctx.persona!.state
      case 'zip':
        return ctx.persona!.zip
      case 'country':
        return str(o, 'country') ?? ctx.persona!.country
      default:
        return ctx.persona!.street
    }
  },
  company(rng) {
    return `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIXES)}`
  },
  url(rng, o) {
    const slug = `${rng.pick(COMPANY_PREFIXES)}${rng.pick(COMPANY_SUFFIXES)}`.toLowerCase()
    const tld = str(o, 'tld') ?? rng.pick(URL_TLDS)
    // `subdomain` defaults to "www"; pass '' to omit it.
    const sub = o.subdomain === undefined ? 'www' : str(o, 'subdomain')
    const prefix = sub ? `${sub}.` : ''
    return `https://${prefix}${slug}.${tld}`
  },
  unit(rng, o) {
    return `${str(o, 'prefix') ?? 'Apt'} ${rng.int(1, 999)}`
  },
  number(rng, o) {
    const min = num(o, 'min', 0)
    const max = num(o, 'max', 1000)
    const decimals = num(o, 'decimals', 0)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return ''
    const step = num(o, 'step', 0)
    if (step > 0 && Number.isFinite(step)) {
      const base = num(o, 'stepBase', min)
      const first = Math.ceil((min - base) / step - 1e-9)
      const last = Math.floor((max - base) / step + 1e-9)
      if (first > last || !Number.isSafeInteger(last - first)) return ''
      return String(Number((base + rng.int(first, last) * step).toFixed(10)))
    }
    const value = min + rng.next() * (max - min)
    return value.toFixed(decimals)
  },
  date(rng, o) {
    // Fixed defaults keep seeded runs reproducible across dates and time zones.
    const day = 86_400_000
    const parsedMin = Date.parse(str(o, 'min') ?? '') / day
    const parsedMax = Date.parse(str(o, 'max') ?? '') / day
    const min = Number.isFinite(parsedMin)
      ? parsedMin
      : Math.min(18262, Number.isFinite(parsedMax) ? parsedMax : 18262)
    const max = Number.isFinite(parsedMax) ? parsedMax : Math.max(22279, min)
    if (min > max) return ''
    const step = num(o, 'step', 1)
    const base = num(o, 'stepBase', min)
    const first = Math.ceil((min - base) / step)
    const last = Math.floor((max - base) / step)
    if (!(step > 0) || first > last) return ''
    return new Date((base + rng.int(first, last) * step) * day).toISOString().slice(0, 10)
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
  patterned(rng, o) {
    const format = str(o, 'format') || '########'
    return format.replace(/[#@*]/g, (ch) => {
      if (ch === '#') return String(rng.int(0, 9))
      if (ch === '@') return LETTERS[rng.int(0, 25)]!
      return rng.bool() ? String(rng.int(0, 9)) : LETTERS[rng.int(0, 25)]!
    })
  },
  handle(rng, o, ctx) {
    const first = ctx.persona!.firstName.toLowerCase()
    const last = ctx.persona!.lastName.toLowerCase()
    const sep = str(o, 'separator') ?? ''
    return `${first}${sep}${last}${rng.int(1, 99)}`
  },
}
