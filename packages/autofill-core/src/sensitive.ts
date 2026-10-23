import type { DetectedField } from '@quikfill/schemas'

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
 * Strongest signals first (input type, then standard `autocomplete` tokens,
 * then label/name keywords). Payment CVV signals are checked before the OTP
 * keywords so a card "security code" is not mistaken for a one-time code.
 */
export function classifySensitive(field: DetectedField): SensitiveCategory | null {
  const type = field.inputType.toLowerCase()
  const ac = field.autocomplete?.toLowerCase().trim().split(/\s+/).at(-1) ?? ''
  const matches = (pattern: RegExp): boolean => signals(field).some((text) => pattern.test(text))

  // Passwords — strongest signal is the input type itself.
  if (type === 'password') return 'password'
  if (ac === 'current-password' || ac === 'new-password') return 'password'

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

  return null
}
