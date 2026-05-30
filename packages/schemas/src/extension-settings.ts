import { z } from 'zod'

/**
 * Default proposed-source policy when no saved mapping exists for a field, and
 * the gate for AI-suggested values. Quikfill is a real-info filler, so the
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
 * User-controlled extension preferences. Persisted local-first behind the
 * `StorageAdapter`; parse untrusted storage through this schema before trusting
 * it (`.catch(DEFAULT_EXTENSION_SETTINGS)` on hydration).
 */
export const extensionSettingsSchema = z.object({
  defaultFillSource: defaultFillSourceSchema,
  autoMatchProfiles: z.boolean(),
  hideValuesByDefault: z.boolean(),
  aiEnabled: z.boolean(),
  locale: extensionLocaleSchema,
  theme: themePrefSchema,
})
export type ExtensionSettings = z.infer<typeof extensionSettingsSchema>

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  defaultFillSource: 'recordField',
  autoMatchProfiles: true,
  hideValuesByDefault: false,
  aiEnabled: true,
  locale: 'en-US',
  theme: 'auto',
}
