import { z } from 'zod'
import { extensionLocaleSchema, extensionSettingsSchema } from './extension-settings'

/** Device-local execution preferences, independent of account settings/sync. */
export const localFillPreferencesSchema = z.object({
  onlyEmpty: z.boolean().default(true),
  seed: z.string().max(128).default(''),
  /** When absent, inherit the existing extension locale. */
  locale: extensionLocaleSchema.optional(),
})
export type LocalFillPreferences = z.infer<typeof localFillPreferencesSchema>
export const DEFAULT_LOCAL_FILL_PREFERENCES: LocalFillPreferences = { onlyEmpty: true, seed: '' }

export const pendingExtensionSettingsSchema = z.object({
  revision: z.string(),
  settings: extensionSettingsSchema,
})
