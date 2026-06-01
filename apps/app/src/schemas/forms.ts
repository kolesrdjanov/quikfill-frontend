import { z } from 'zod'
import {
  entityFieldTypeSchema,
  generatorKindSchema,
  requestMagicLinkInputSchema,
  seedModeSchema,
} from '@quikfill/schemas'
import { isEmailAllowed } from '@/lib/allowed-users'

/**
 * Sign-in email step — the shared magic-link contract plus a soft allowlist gate
 * (see `lib/allowed-users.ts`). The refinement targets the `email` path so the
 * message renders inline under the field. When no allowlist is configured the
 * refinement is a no-op.
 */
export const signInEmailSchema = requestMagicLinkInputSchema.refine(
  (values) => isEmailAllowed(values.email),
  { path: ['email'], message: "This email doesn't have access yet." },
)
export type SignInEmailValues = z.input<typeof signInEmailSchema>

/** Split a textarea of newline/comma-separated values into a trimmed list. */
const linesToList = z
  .string()
  .optional()
  .default('')
  .transform((value) =>
    value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )

/** Join a stored list back into textarea text for editing. */
export function listToLines(list: string[] | undefined): string {
  return (list ?? []).join('\n')
}

export const domainFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hostnames: linesToList,
  description: z.string().optional(),
})
export type DomainFormValues = z.input<typeof domainFormSchema>

export const formProfileFormSchema = z.object({
  domainId: z.string().uuid('Choose an app'),
  name: z.string().min(1, 'Name is required'),
  urlPatterns: linesToList,
  pageTitlePatterns: linesToList,
})
export type FormProfileFormValues = z.input<typeof formProfileFormSchema>

export const entityTypeFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})
export type EntityTypeFormValues = z.input<typeof entityTypeFormSchema>

export const entityRecordMetaSchema = z.object({
  entityTypeId: z.string().uuid('Choose a type'),
  name: z.string().min(1, 'Name is required'),
})
export type EntityRecordMetaValues = z.input<typeof entityRecordMetaSchema>

export const profileFormSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})
export type ProfileFormValues = z.input<typeof profileFormSchema>

export const generatorPresetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  locale: z.string().min(1).default('en'),
  seedMode: seedModeSchema.default('random'),
  seed: z.string().optional(),
})
export type GeneratorPresetFormValues = z.input<typeof generatorPresetFormSchema>

/** Re-exported enum value lists for `<option>` rendering in forms. */
export const entityFieldTypes = entityFieldTypeSchema.options
export const generatorKinds = generatorKindSchema.options
