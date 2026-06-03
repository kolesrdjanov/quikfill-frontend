import { z } from 'zod'
import { isoDateTime, uuid } from './common'
import { DEFAULT_EXTENSION_SETTINGS, extensionSettingsSchema } from './extension-settings'

/**
 * A user account. Pre-auth, the extension/app use an implicit local account
 * (a generated id, no email) until backend auth issues a real one. Once the
 * backend issues one it carries the profile fields below (mirrors the backend
 * `UserResponseDto`); `firstName`/`lastName`/`emailVerifiedAt` are nullable.
 */
export const userAccountSchema = z.object({
  id: uuid,
  email: z.string().email().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  emailVerifiedAt: isoDateTime.nullable().optional(),
  createdAt: isoDateTime.optional(),
  /** Admin rights (from backend ADMIN_EMAILS). Absent for pre-auth local accounts. */
  isAdmin: z.boolean().optional(),
  /**
   * Dashboard-managed extension customization. The backend always sends a full,
   * defaulted object; `.catch` keeps older sessions / pre-auth local accounts
   * resilient by falling back to the canonical defaults.
   */
  extensionSettings: extensionSettingsSchema.catch(DEFAULT_EXTENSION_SETTINGS).optional(),
})

export type UserAccount = z.infer<typeof userAccountSchema>

/** Request body for `PATCH /users/me` (mirrors the backend `UpdateProfileDto`). */
export const updateProfileInputSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>
