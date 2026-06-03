import { z } from 'zod'

/** Value-generator locale. Sent with /ai/fill; drives generated language, names, addresses, phones. */
export const extensionLocaleSchema = z.enum(['en-US', 'en-GB', 'sr-RS'])
export type ExtensionLocale = z.infer<typeof extensionLocaleSchema>

/** Theme preference. `auto` follows the OS `prefers-color-scheme`. */
export const themePrefSchema = z.enum(['light', 'auto', 'dark'])
export type ThemePref = z.infer<typeof themePrefSchema>

/**
 * Preferred date format for AI-proposed / generated dates. `auto` lets the
 * locale + the field's own picker decide (the existing behaviour).
 */
export const dateFormatSchema = z.enum(['auto', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'])
export type DateFormatPref = z.infer<typeof dateFormatSchema>

/** Resting size of the in-page Fill button. */
export const buttonSizeSchema = z.enum(['sm', 'md', 'lg'])
export type ButtonSizePref = z.infer<typeof buttonSizeSchema>

/** Corner the in-page Fill button anchors to, relative to each form. */
export const buttonPositionSchema = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left'])
export type ButtonPositionPref = z.infer<typeof buttonPositionSchema>

/**
 * User-controlled extension preferences. The dashboard is the source of truth:
 * the extension hydrates these from the backend (via `GET /users/me`) into the
 * local `StorageAdapter`, and reads them here. Parse untrusted storage through
 * this schema before trusting it (`.catch(DEFAULT_EXTENSION_SETTINGS)` on
 * hydration). All fields are kept **flat** so the shallow `{...DEFAULT, ...raw}`
 * merge in `useSettings` still upgrades older/partial payloads correctly.
 *
 * Passwords and one-time codes are intentionally **never** fillable and carry no
 * field — see `classifySensitive` in `@quikfill/autofill-core`.
 */
export const extensionSettingsSchema = z.object({
  // Activation
  globalEnabled: z.boolean(),
  blockedHostnames: z.array(z.string()),
  // Generated-data preferences
  locale: extensionLocaleSchema,
  dateFormat: dateFormatSchema,
  // Privacy & display
  hideValuesByDefault: z.boolean(),
  theme: themePrefSchema,
  // Appearance — the in-page Fill button
  showFillButton: z.boolean(),
  buttonSize: buttonSizeSchema,
  buttonPosition: buttonPositionSchema,
})
export type ExtensionSettings = z.infer<typeof extensionSettingsSchema>

/**
 * Reduce an arbitrary blocklist entry (or a raw `location.hostname`) to a bare,
 * comparable hostname: lower-cased, with any scheme, userinfo, port, and
 * path/query/hash stripped, and a leading `www.` removed. Users naturally paste
 * full URLs (`https://app.quikfill.io/`) into the blocklist textarea; without
 * this they would never match the page's bare `location.hostname`. Returns `''`
 * for blank input. Shared by the dashboard (normalize-on-save) and the extension
 * overlay gate (normalize-on-compare) so both sides agree.
 */
export function normalizeHostname(value: string): string {
  const raw = value.trim().toLowerCase()
  if (raw === '') return ''
  try {
    // A bare hostname has no scheme; give `URL` one so it parses, then take the
    // host it isolates (drops userinfo/port/path/query/hash for free).
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    // Unparseable (e.g. stray characters) — best-effort manual strip.
    return raw
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/^[^@]*@/, '')
      .replace(/:\d+$/, '')
      .replace(/^www\./, '')
  }
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  globalEnabled: true,
  blockedHostnames: [],
  locale: 'en-US',
  dateFormat: 'auto',
  hideValuesByDefault: false,
  theme: 'auto',
  showFillButton: true,
  buttonSize: 'md',
  buttonPosition: 'bottom-right',
}
