import { z } from 'zod'
import { userAccountSchema, type UserAccount } from './user'

/** `POST /auth/magic-link` request — mirrors backend `RequestMagicLinkDto`. */
export const requestMagicLinkInputSchema = z.object({
  email: z.string().email(),
})
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkInputSchema>

/** `POST /auth/magic-link` response — `devCode` is only present outside production. */
export const magicLinkRequestedSchema = z.object({
  message: z.string(),
  devCode: z.string().optional(),
})
export type MagicLinkRequested = z.infer<typeof magicLinkRequestedSchema>

/** The emailed sign-in OTP: a 6-digit numeric code. */
export const otpCodeInputSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
})
export type OtpCodeInput = z.infer<typeof otpCodeInputSchema>

/** `POST /auth/verify` request — mirrors backend `VerifyMagicLinkDto` (email + OTP code). */
export const verifyMagicLinkInputSchema = requestMagicLinkInputSchema.merge(otpCodeInputSchema)
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

/**
 * A normalized auth failure kind the UI can render without knowing HTTP. The two
 * "subscription-related" kinds (`payment-required`, `quota-exceeded`) are mapped
 * now so the sign-in/usage screens have stable targets, even though billing
 * isn't built yet (`payment-required` is forward-looking — the backend does not
 * emit 402 today).
 */
export type AuthErrorKind =
  | 'invalid-code' // 400 — bad/expired OTP or email
  | 'unauthorized' // 401 — session invalid/expired
  | 'payment-required' // 402 — billing required (subscription-related)
  | 'quota-exceeded' // 429 — usage limit reached (subscription-related)
  | 'unavailable' // 503 — backend unavailable
  | 'network' // transport failure (no HTTP status)
  | 'unknown' // anything else

/** The auth lifecycle state surfaces bind to (see `useAuth`). */
export type AuthStatus = 'loading' | 'signed-out' | 'code-sent' | 'signed-in' | 'error'

export interface AuthState {
  status: AuthStatus
  /** Present when `status === 'signed-in'`. */
  user?: UserAccount
  /** Present when `status === 'code-sent'` — the email awaiting its OTP. */
  pendingEmail?: string
  /** Present when `status === 'error'`. */
  error?: AuthErrorKind
}

/**
 * Map an HTTP status (from `ApiClientError.status`) to an {@link AuthErrorKind}.
 * A missing status means the request never got a response (transport failure).
 */
export function authErrorKind(status?: number): AuthErrorKind {
  switch (status) {
    case 400:
      return 'invalid-code'
    case 401:
      return 'unauthorized'
    case 402:
      return 'payment-required'
    case 429:
      return 'quota-exceeded'
    case 503:
      return 'unavailable'
    case undefined:
      return 'network'
    default:
      return 'unknown'
  }
}
