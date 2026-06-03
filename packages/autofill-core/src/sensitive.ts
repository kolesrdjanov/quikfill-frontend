import type { DetectedField } from '@quikfill/schemas'

/**
 * Sensitive field categories the extension gates on. `password` and `otp` are
 * **never** filled (no user setting — QuikFill is not a password manager).
 * `payment` and `governmentId` are filled only when the user opts in
 * (`fillPaymentFields` / `fillGovernmentIdFields`).
 */
export type SensitiveCategory = 'password' | 'otp' | 'payment' | 'governmentId'

/** Lowercased text we scan for keyword signals (label, name, attributes). */
function haystack(field: DetectedField): string {
  return [
    field.name,
    field.domId,
    field.labelText,
    field.placeholder,
    field.ariaLabel,
    field.autocomplete,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Categorize a detected field as sensitive, or `null` if it is ordinary.
 * Strongest signals first (input type, then standard `autocomplete` tokens,
 * then label/name keywords). Payment CVV signals are checked before the OTP
 * keywords so a card "security code" is not mistaken for a one-time code.
 */
export function classifySensitive(field: DetectedField): SensitiveCategory | null {
  const type = field.inputType.toLowerCase()
  const ac = field.autocomplete?.toLowerCase().trim() ?? ''
  const text = haystack(field)

  // Passwords — strongest signal is the input type itself.
  if (type === 'password') return 'password'
  if (ac === 'current-password' || ac === 'new-password') return 'password'

  // Payment / card — `cc-*` autocomplete tokens are unambiguous.
  if (ac.startsWith('cc-')) return 'payment'

  // One-time / 2FA code — the standard token.
  if (ac === 'one-time-code') return 'otp'

  // Keyword fallbacks, ordered to avoid cross-category collisions.
  if (/\bpassword\b|\bpasswd\b|\bpwd\b/.test(text)) return 'password'
  if (/credit.?card|card.?number|\bcvv\b|\bcvc\b|card.?verification|expir(?:y|ation)/.test(text)) {
    return 'payment'
  }
  if (
    /one.?time.?(?:code|password)|\botp\b|2fa|two.?factor|verification.?code|authenticator/.test(
      text,
    )
  ) {
    return 'otp'
  }
  if (
    /\bssn\b|social.?security|tax.?id|\bein\b|\bfein\b|national.?id|passport.?number/.test(text)
  ) {
    return 'governmentId'
  }

  return null
}
