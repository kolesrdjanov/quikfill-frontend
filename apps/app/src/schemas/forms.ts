import { z } from 'zod'
import {
  entityFieldTypeSchema,
  extensionSettingsSchema,
  generatorKindSchema,
  requestMagicLinkInputSchema,
  seedModeSchema,
} from '@quikfill/schemas'

/**
 * Sign-in email step — just the shared magic-link contract. Sign-in is open: the
 * backend issues a code for any valid email, so there is no client-side allowlist.
 */
export const signInEmailSchema = requestMagicLinkInputSchema
export type SignInEmailValues = z.input<typeof signInEmailSchema>

/** Join a stored list back into textarea text for editing. */
export function listToLines(list: string[] | undefined): string {
  return (list ?? []).join('\n')
}

/**
 * Split a textarea of newline/comma-separated values into a trimmed, non-empty
 * list — the inverse of {@link listToLines}, applied in a form's submit handler.
 *
 * Deliberately a plain function, NOT a Zod `.transform()` on the form field:
 * VeeValidate writes a schema's transformed OUTPUT back into the form state and
 * then re-validates it as INPUT, so a string→array transform fails the second
 * pass ("Expected string, received array"), leaving the form permanently invalid
 * and silently blocking submit. Textarea fields therefore stay plain strings in
 * the form schema and are split here when the form is submitted.
 */
export function linesToList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** A textarea field holding newline/comma-separated values (split via {@link linesToList}). */
const linesTextarea = z.string().optional().default('')

export const domainFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hostnames: linesTextarea,
  description: z.string().optional(),
})
export type DomainFormValues = z.input<typeof domainFormSchema>

export const formProfileFormSchema = z.object({
  domainId: z.string().uuid('Choose an app'),
  name: z.string().min(1, 'Name is required'),
  urlPatterns: linesTextarea,
  pageTitlePatterns: linesTextarea,
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

/**
 * Extension-customization form. Mirrors the shared `extensionSettingsSchema`
 * contract, but edits `blockedHostnames` as a newline/comma-separated textarea
 * STRING. The submit handler splits it back into a trimmed list with
 * {@link linesToList} before calling `auth.updateSettings`, so the persisted
 * value still equals `ExtensionSettings`.
 */
export const extensionSettingsFormSchema = extensionSettingsSchema.extend({
  blockedHostnames: linesTextarea,
  allowedHostnames: linesTextarea,
})
export type ExtensionSettingsFormValues = z.input<typeof extensionSettingsFormSchema>

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
