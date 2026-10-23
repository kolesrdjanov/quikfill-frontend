import type { DetectedField } from '@quikfill/schemas'
import { classifyField } from './classify'

/**
 * Sensitive field categories: `password` / `otp` (most sensitive) and `payment` /
 * `governmentId` (card / government-ID fields). The local planner and optional
 * AI flow leave these fields for the user.
 */
export type SensitiveCategory = 'password' | 'otp' | 'payment' | 'governmentId'

/** Lowercased text we scan for keyword signals (label, name, attributes). */
function signals(field: DetectedField): string[] {
  return [
    field.name,
    field.domId,
    field.labelText,
    field.placeholder,
    field.ariaLabel,
    field.ariaLabelledByText,
  ]
    .filter((value): value is string => !!value)
    .map((value) =>
      value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase(),
    )
}

/**
 * Categorize a detected field as sensitive, or `null` if it is ordinary.
 * Password types, current-password, payment/OTP tokens and credential keywords
 * take precedence. A generic new-password hint can be contradicted by a known
 * ordinary field purpose. Payment CVV signals are checked before the OTP
 * keywords so a card "security code" is not mistaken for a one-time code.
 */
export function classifySensitive(field: DetectedField): SensitiveCategory | null {
  const type = field.inputType.toLowerCase()
  const ac = field.autocomplete?.toLowerCase().trim().split(/\s+/).at(-1) ?? ''
  const matches = (pattern: RegExp): boolean => signals(field).some((text) => pattern.test(text))

  // Passwords — strongest signal is the input type itself.
  if (type === 'password') return 'password'
  if (ac === 'current-password') return 'password'

  // Payment / card — `cc-*` autocomplete tokens are unambiguous.
  if (ac.startsWith('cc-')) return 'payment'

  // One-time / 2FA code — the standard token.
  if (ac === 'one-time-code') return 'otp'

  // Keyword fallbacks, ordered to avoid cross-category collisions.
  if (matches(/\b(?:password|passwd|pwd)\b/)) return 'password'
  if (
    matches(
      /\b(?:credit\s*card|card\s*number|cvv|cvc|card\s*verification|card\s*(?:expiry|expiration))\b/,
    )
  ) {
    return 'payment'
  }
  if (
    matches(
      /\b(?:one\s*time\s*(?:code|password)|otp|2fa|two\s*factor|verification\s*code|authenticator)\b/,
    )
  ) {
    return 'otp'
  }
  if (matches(/\b(?:ssn|social\s*security|tax\s*id|ein|fein|national\s*id|passport\s*number)\b/)) {
    return 'governmentId'
  }

  if (ac === 'new-password') {
    // Shared input components sometimes use this hint to suppress browser
    // autofill on every field. A known non-credential purpose overrides the
    // hint; actual password types/keywords above and ambiguous inputs do not.
    // IDs are locators, not evidence of an ordinary purpose.
    const purpose = classifyField({
      ...field,
      autocomplete: undefined,
      domId: undefined,
      labelText: field.labelText || field.ariaLabelledByText || field.ariaLabel,
    })
    if (
      purpose.confidence < 0.6 ||
      ['unknown', 'masked', 'taxId', 'ssn'].includes(purpose.semanticType)
    )
      return 'password'
  }

  return null
}
