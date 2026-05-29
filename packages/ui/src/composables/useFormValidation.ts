import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import type { z } from 'zod'

/**
 * The single entry point for forms: wraps VeeValidate's `useForm` with a Zod
 * schema via `toTypedSchema`. Use the returned `defineField()` (not raw
 * `useField`) and validate on blur/change. See repo CLAUDE.md rule 1.
 *
 * Lives in `@quikfill/ui` (rule 4: shared UI + utils) so every surface — the
 * dashboard and the extension — validates forms the same way.
 */
export function useFormValidation<S extends z.ZodType>(
  schema: S,
  initialValues?: Partial<z.input<S>>,
) {
  return useForm({
    validationSchema: toTypedSchema(schema),
    initialValues: initialValues as z.input<S>,
  })
}
