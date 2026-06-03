import type { ExtensionSettings } from '@quikfill/schemas'

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

/** Resting diameter (px) for the configured button size. */
export function buttonDiameter(size: ExtensionSettings['buttonSize']): number {
  if (size === 'sm') return 40
  if (size === 'lg') return 54
  return 46
}
