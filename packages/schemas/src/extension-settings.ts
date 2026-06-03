import { z } from 'zod'

/**
 * Default proposed-source policy when no saved mapping exists for a field, and
 * the gate for AI-suggested values. QuikFill is a real-info filler, so the
 * default is `recordField` (only the user's own saved data). `hybrid` /
 * `generatorRule` opt into clearly-labeled synthetic **sample** data as a
 * fallback; `aiGenerated` leaves the field for the user to fill.
 */
export const defaultFillSourceSchema = z.enum([
  'recordField', // only my saved data (real-info-first default)
  'hybrid', // saved data, then sample-data fallback
  'generatorRule', // sample data
  'aiGenerated', // leave it for me to fill
])
export type DefaultFillSourcePref = z.infer<typeof defaultFillSourceSchema>

/** Whether a fill-source preference permits synthetic sample-data generation. */
export function allowsSampleData(pref: DefaultFillSourcePref): boolean {
  return pref === 'hybrid' || pref === 'generatorRule'
}

/** Value-generator locale. Drives generated names/addresses/phones. */
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
  // Safety — sensitive fields (passwords/OTP are always skipped, no toggle)
  fillPaymentFields: z.boolean(),
  fillGovernmentIdFields: z.boolean(),
  // Fill behaviour
  defaultFillSource: defaultFillSourceSchema,
  autoMatchProfiles: z.boolean(),
  aiEnabled: z.boolean(),
  skipFilledFields: z.boolean(),
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

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  globalEnabled: true,
  blockedHostnames: [],
  fillPaymentFields: false,
  fillGovernmentIdFields: false,
  defaultFillSource: 'hybrid',
  autoMatchProfiles: true,
  aiEnabled: true,
  skipFilledFields: false,
  locale: 'en-US',
  dateFormat: 'auto',
  hideValuesByDefault: false,
  theme: 'auto',
  showFillButton: true,
  buttonSize: 'md',
  buttonPosition: 'bottom-right',
}
