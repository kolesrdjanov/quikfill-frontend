import { z } from 'zod'

/** Default proposed-source policy when no saved mapping exists for a field. */
export const defaultFillSourceSchema = z.enum([
  'hybrid', // record → generator fallback (the everyday default)
  'recordField',
  'generatorRule',
  'aiGenerated',
])
export type DefaultFillSourcePref = z.infer<typeof defaultFillSourceSchema>

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
  defaultFillSource: 'hybrid',
  autoMatchProfiles: true,
  hideValuesByDefault: false,
  aiEnabled: true,
  locale: 'en-US',
  theme: 'auto',
}
