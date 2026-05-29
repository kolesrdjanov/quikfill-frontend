import { z } from 'zod'
import { userAccountSchema } from './user'

/** `POST /auth/magic-link` request — mirrors backend `RequestMagicLinkDto`. */
export const requestMagicLinkInputSchema = z.object({
  email: z.string().email(),
})
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkInputSchema>

/** `POST /auth/magic-link` response — `devLink` is only present outside production. */
export const magicLinkRequestedSchema = z.object({
  message: z.string(),
  devLink: z.string().optional(),
})
export type MagicLinkRequested = z.infer<typeof magicLinkRequestedSchema>

/** `POST /auth/verify` request — mirrors backend `VerifyMagicLinkDto`. */
export const verifyMagicLinkInputSchema = z.object({
  token: z.string().min(1),
})
export type VerifyMagicLinkInput = z.infer<typeof verifyMagicLinkInputSchema>

/** `POST /auth/refresh` and `/auth/logout` request — mirrors `RefreshTokenDto`. */
export const refreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
})
export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>

/** `POST /auth/verify` & `/auth/refresh` response — mirrors `AuthTokensDto`. */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
  user: userAccountSchema,
})
export type AuthTokens = z.infer<typeof authTokensSchema>
