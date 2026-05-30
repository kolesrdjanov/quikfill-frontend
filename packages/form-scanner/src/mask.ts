/**
 * Mask-aware fill helpers.
 *
 * Many forms wrap inputs in an input-mask directive (e.g. maska:
 * `data-maska="(###) ###-####"`) that reformats the value the instant we
 * dispatch `input`. Writing a raw value like `+1-976-729-2722` then lets the
 * mask mangle it — the country-code digit shifts into the area code, giving
 * `(197) 672-9272` — and a strict read-back comparison reports a false
 * "failed" even though the field is visibly filled.
 *
 * We instead detect the mask, coerce the proposed value to fit it (so the right
 * characters land), and compare read-back values tolerantly (ignoring the mask
 * delimiters the directive inserts). Pure string logic — no DOM, no Chrome.
 */

export interface MaskSpec {
  pattern: string
  /** Per-token matchers. maska defaults: `#` digit, `@` letter, `*` alphanumeric. */
  tokens: Record<string, RegExp>
}

const DEFAULT_TOKENS: Record<string, RegExp> = {
  '#': /[0-9]/,
  '@': /[a-zA-Z]/,
  '*': /[a-zA-Z0-9]/,
}

/** The raw maska pattern string for an element, if any (for scan-time capture). */
export function getMaskPattern(el: Element): string | undefined {
  return getMaskSpec(el)?.pattern
}

/** Read a maska-style mask off a live element, if any. */
export function getMaskSpec(el: Element): MaskSpec | undefined {
  const raw = el.getAttribute('data-maska')
  if (raw == null) return undefined
  const pattern = parseMaskPattern(raw)
  if (!pattern) return undefined
  return { pattern, tokens: DEFAULT_TOKENS }
}

function parseMaskPattern(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  // data-maska may hold a JSON array of masks — use the first string entry.
  if (trimmed.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(trimmed)
      const first = Array.isArray(arr) ? arr.find((m) => typeof m === 'string') : undefined
      return typeof first === 'string' ? first : undefined
    } catch {
      return undefined
    }
  }
  return trimmed
}

/**
 * Apply a mask to a value the way maska does: walk the pattern, consuming the
 * next matching source char for each token and inserting literals verbatim.
 */
export function applyMask(value: string, spec: MaskSpec): string {
  let out = ''
  let vi = 0
  let lastFilled = 0 // length up to and including the last token char we placed
  for (const pc of spec.pattern) {
    const matcher = spec.tokens[pc]
    if (matcher) {
      while (vi < value.length && !matcher.test(value[vi])) vi++
      if (vi >= value.length) break
      out += value[vi]
      vi++
      lastFilled = out.length
    } else {
      out += pc
      // If the source already contains this literal at the cursor, consume it
      // so a pre-formatted value isn't doubled.
      if (vi < value.length && value[vi] === pc) vi++
    }
  }
  // Drop trailing literals (delimiters) left dangling after the last real char.
  return out.slice(0, lastFilled)
}

/**
 * Fit a proposed value to a mask. For all-digit masks (phone, EIN, SSN, zip,
 * date) we extract digits; when there are more digits than slots and the mask
 * looks phone-shaped — or the value carried a leading `+`/NANP country code — we
 * keep the *trailing* digits so the country code is dropped rather than shifted
 * into the area code. Mixed masks fall back to plain left-to-right application.
 */
export function coerceToMask(value: string, spec: MaskSpec): string {
  const tokenChars = [...spec.pattern].filter((c) => spec.tokens[c])
  const allDigitMask = tokenChars.length > 0 && tokenChars.every((c) => c === '#')
  if (!allDigitMask) return applyMask(value, spec)

  const slots = tokenChars.length
  const digits = value.replace(/\D/g, '')
  if (digits.length <= slots) return applyMask(digits, spec)

  const phoneShaped =
    /[()]/.test(spec.pattern) ||
    value.trim().startsWith('+') ||
    // NANP: an 11-digit number with a leading "1" into a 10-digit phone mask.
    (slots === 10 && digits.length === 11 && digits[0] === '1')
  const chosen = phoneShaped ? digits.slice(digits.length - slots) : digits.slice(0, slots)
  return applyMask(chosen, spec)
}

/**
 * Compare two field values ignoring formatting differences (mask delimiters,
 * case, spacing). An exact match always wins; otherwise both must reduce to the
 * same non-empty alphanumeric core — so a reformatted phone passes but a
 * rejected/empty value does not.
 */
export function valuesMatch(a: string, b: string): boolean {
  if (a === b) return true
  const na = normalizeValue(a)
  return na !== '' && na === normalizeValue(b)
}

function normalizeValue(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '').toLowerCase()
}
