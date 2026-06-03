import type { ExtensionSettings } from '@quikfill/schemas'
import type { SensitiveCategory } from '@quikfill/autofill-core'

/**
 * Pure decision helpers for the in-page overlay, extracted so the gating logic
 * is unit-testable without a DOM or `chrome`. The overlay supplies the live
 * settings, the current hostname, and the AI-budget flag.
 */

/** Whether the in-page Fill button should appear at all on this page. */
export function shouldShowOverlay(
  settings: ExtensionSettings,
  hostname: string,
  overQuota: boolean,
): boolean {
  if (overQuota) return false
  if (!settings.globalEnabled) return false
  if (!settings.showFillButton) return false
  return !isHostBlocked(settings.blockedHostnames, hostname)
}

/** Hostname match against the blocklist: exact, or any subdomain of an entry (www-insensitive). */
export function isHostBlocked(blocked: readonly string[], hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return blocked.some((entry) => {
    const e = entry
      .trim()
      .toLowerCase()
      .replace(/^www\./, '')
    return e !== '' && (host === e || host.endsWith(`.${e}`))
  })
}

/**
 * Whether a single field may be filled, given its sensitive category and whether
 * it already has a value. Passwords and one-time codes are never filled; payment
 * and government-ID fields need the matching opt-in; `skipFilledFields` skips any
 * field that already holds a value.
 */
export function isFieldAllowed(
  settings: ExtensionSettings,
  sensitive: SensitiveCategory | null,
  hasValue: boolean,
): boolean {
  if (sensitive === 'password' || sensitive === 'otp') return false
  if (sensitive === 'payment' && !settings.fillPaymentFields) return false
  if (sensitive === 'governmentId' && !settings.fillGovernmentIdFields) return false
  if (settings.skipFilledFields && hasValue) return false
  return true
}

/** Resting diameter (px) for the configured button size. */
export function buttonDiameter(size: ExtensionSettings['buttonSize']): number {
  if (size === 'sm') return 40
  if (size === 'lg') return 54
  return 46
}
