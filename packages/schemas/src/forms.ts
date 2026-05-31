import { z } from 'zod'

/**
 * A form grouped out of a flat scan: its member fields plus how to reach its
 * submit control. `formId` is either a real `<form>`'s stamped id or a synthetic
 * id for a formless group (the nearest common container, stamped `data-qf-form`).
 * Built by `@quikfill/form-scanner`'s grouped pass — DOM-only, no Chrome/Vue.
 */
export const detectedFormSchema = z.object({
  /** Stable id for the grouping element (real `<form>` or synthetic container). */
  formId: z.string().min(1),
  /** `data-qf-id`s of the fields that belong to this form, in scan order. */
  fieldIds: z.array(z.string()).default([]),
  /**
   * Ranked selectors for the form's submit control (mirrors
   * `DetectedField.selectorCandidates`). Empty when no submit button was found.
   */
  submitSelectorCandidates: z.array(z.string()).default([]),
  /** `'main'` for the top document, otherwise an opaque frame id. */
  frame: z.string().default('main'),
  /** A human label for the form (heading / aria-label / submit text), when found. */
  label: z.string().optional(),
})
export type DetectedForm = z.infer<typeof detectedFormSchema>
