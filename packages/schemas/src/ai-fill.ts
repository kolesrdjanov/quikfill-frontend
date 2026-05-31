import { z } from 'zod'

/**
 * Page-level globals sent with an `/ai/fill` request. Minimal, non-identifying
 * context that helps the model understand what the form is for. Never HTML.
 */
export const aiFillPageSchema = z.object({
  /** `document.documentElement.lang` (may be empty). */
  lang: z.string().default(''),
  /** `document.title`. */
  title: z.string().default(''),
  /** `<meta name="description">` content. */
  description: z.string().default(''),
})
export type AiFillPage = z.infer<typeof aiFillPageSchema>

/**
 * One field in an `/ai/fill` request — redacted metadata only. Built from a
 * DetectedField. NEVER carries the current value or raw HTML. `fieldId` is the
 * scanner's `data-qf-id`; the response echoes it back unchanged.
 */
export const aiFillFieldSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().optional(),
  inputType: z.string(),
  name: z.string().optional(),
  placeholder: z.string().optional(),
  autocomplete: z.string().optional(),
  ariaLabel: z.string().optional(),
  required: z.boolean().default(false),
  pattern: z.string().optional(),
  options: z.array(z.string()).optional(),
})
export type AiFillField = z.infer<typeof aiFillFieldSchema>

/**
 * The `POST /ai/fill` request body. Redacted field metadata + page globals — the
 * single source of truth for the frontend builder, the backend DTO, and the dev
 * mock. The privacy guard rejects anything carrying raw HTML.
 */
export const aiFillRequestSchema = z.object({
  page: aiFillPageSchema,
  fields: z.array(aiFillFieldSchema).min(1),
})
export type AiFillRequest = z.infer<typeof aiFillRequestSchema>

/** One concrete value the model produced for a field, keyed by the sent `fieldId`. */
export const aiFillValueSchema = z.object({
  fieldId: z.string().min(1),
  value: z.string(),
})
export type AiFillValue = z.infer<typeof aiFillValueSchema>

/**
 * The `/ai/fill` response — concrete fill values keyed by the same `fieldId` the
 * frontend sent. Untrusted model output: re-validated against this on the backend
 * and unknown/malformed entries are dropped before it is returned.
 */
export const aiFillResponseSchema = z.object({
  values: z.array(aiFillValueSchema).default([]),
})
export type AiFillResponse = z.infer<typeof aiFillResponseSchema>
