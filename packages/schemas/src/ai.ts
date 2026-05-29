import { z } from 'zod'

/**
 * Minimized, redacted input sent to the AI classifier. Built from DetectedField
 * by the `ai` package. NEVER includes the current value or raw HTML.
 */
export const fieldSummarySchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().optional(),
  inputType: z.string(),
  autocomplete: z.string().optional(),
  options: z.array(z.string()).optional(),
  nearbyText: z.string().optional(),
  sectionHeading: z.string().optional(),
})
export type FieldSummary = z.infer<typeof fieldSummarySchema>

/**
 * AI output — untrusted. Every response is validated against this before use,
 * and surfaced to the user as a reviewable/rejectable suggestion (never applied).
 */
export const aiSuggestionSchema = z.object({
  fieldId: z.string().min(1),
  semanticType: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
})
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>
