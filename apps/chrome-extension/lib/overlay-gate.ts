import { normalizeHostname, type ExtensionSettings } from '@quikfill/schemas'

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
  return isHostActive(settings, hostname)
}

/**
 * Whether QuikFill is active on this host under the current activation mode:
 * `allowlist` → only hosts on the allowlist; `all` → every host except the
 * blocklist. This is the per-site decision behind both the overlay gate and the
 * popup's "this site" toggle (it ignores the global/quota/button flags).
 */
export function isHostActive(settings: ExtensionSettings, hostname: string): boolean {
  return settings.activationMode === 'allowlist'
    ? isHostAllowed(settings.allowedHostnames, hostname)
    : !isHostBlocked(settings.blockedHostnames, hostname)
}

/**
 * Hostname match against a list: exact, or any subdomain of an entry. Both sides
 * are run through {@link normalizeHostname}, so a list entry pasted as a full URL
 * (`https://app.quikfill.io/`) still matches the page's bare `location.hostname`,
 * and `www.`/scheme/port differences never affect a match.
 */
function matchesHostList(list: readonly string[], hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (host === '') return false
  return list.some((entry) => {
    const e = normalizeHostname(entry)
    return e !== '' && (host === e || host.endsWith(`.${e}`))
  })
}

/** Host is on the blocklist (exact or subdomain). */
export function isHostBlocked(blocked: readonly string[], hostname: string): boolean {
  return matchesHostList(blocked, hostname)
}

/** Host is on the allowlist (exact or subdomain). */
export function isHostAllowed(allowed: readonly string[], hostname: string): boolean {
  return matchesHostList(allowed, hostname)
}

/** Add or remove the normalized `host` from a list (compared normalized). */
function setMembership(list: readonly string[], host: string, present: boolean): string[] {
  const without = list.filter((h) => normalizeHostname(h) !== host)
  return present ? [...without, host] : without
}

/**
 * Return new settings with `hostname` turned on/off for the CURRENT mode:
 * `allowlist` → on adds it to `allowedHostnames`, off removes it; `all` → off adds
 * it to `blockedHostnames`, on removes it. The non-active list is left untouched
 * so switching modes preserves config. The stored entry is the normalized host.
 */
export function setHostEnabled(
  settings: ExtensionSettings,
  hostname: string,
  enabled: boolean,
): ExtensionSettings {
  const host = normalizeHostname(hostname)
  if (host === '') return settings
  return settings.activationMode === 'allowlist'
    ? { ...settings, allowedHostnames: setMembership(settings.allowedHostnames, host, enabled) }
    : { ...settings, blockedHostnames: setMembership(settings.blockedHostnames, host, !enabled) }
}

/** The host list the current mode acts on (allowed in `allowlist`, blocked in `all`). */
export function activeHostList(settings: ExtensionSettings): readonly string[] {
  return settings.activationMode === 'allowlist'
    ? settings.allowedHostnames
    : settings.blockedHostnames
}

/** Drop `hostname` from the active list, returning the site to the mode's default. */
export function removeActiveHost(settings: ExtensionSettings, hostname: string): ExtensionSettings {
  return setHostEnabled(settings, hostname, settings.activationMode === 'all')
}

/** Resting diameter (px) for the configured button size. */
export function buttonDiameter(size: ExtensionSettings['buttonSize']): number {
  if (size === 'sm') return 40
  if (size === 'lg') return 54
  return 46
}
