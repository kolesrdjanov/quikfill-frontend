import { z } from 'zod'
import { isoDateTime, uuid } from './common'

/**
 * A user account. Pre-auth, the extension/app use an implicit local account
 * (a generated id, no email) until backend auth issues a real one.
 */
export const userAccountSchema = z.object({
  id: uuid,
  email: z.string().email().optional(),
  createdAt: isoDateTime.optional(),
})

export type UserAccount = z.infer<typeof userAccountSchema>
