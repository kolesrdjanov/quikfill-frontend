import { z } from 'zod'
import { isoDateTime, nullableOptional, uuid } from './common'

/**
 * A beta-access allowlist entry (mirrors the backend `BetaUserResponseDto`).
 * Admins manage these; an email present here may sign in to QuikFill.
 */
export const betaUserSchema = z.object({
  id: uuid,
  email: z.string().email(),
  invitedByEmail: nullableOptional(z.string()),
  createdAt: isoDateTime,
})
export type BetaUser = z.infer<typeof betaUserSchema>

/** Request body for `POST /admin/beta-users` (mirrors backend `InviteBetaUserDto`). */
export const inviteBetaUserInputSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})
export type InviteBetaUserInput = z.infer<typeof inviteBetaUserInputSchema>
