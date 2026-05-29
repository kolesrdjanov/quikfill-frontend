import { z } from 'zod'

/**
 * Placeholder export for Iteration 1.
 * Iteration 2 replaces this with the canonical Zod contracts
 * (UserAccount, FormProfile, DetectedField, FillPlan, …).
 */
export const placeholderSchema = z.object({
  ok: z.literal(true),
})

export type Placeholder = z.infer<typeof placeholderSchema>
