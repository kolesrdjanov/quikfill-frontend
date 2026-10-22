import { z } from 'zod'
import { detectedFieldSchema } from './detected-field'

export const recipeCaseSchema = z.enum([
  'valid',
  'invalid',
  'minimum',
  'maximum',
  'belowMinimum',
  'aboveMaximum',
  'missing',
])
export const recipeRuleSchema = z
  .object({
    fieldKey: z.string().min(1).max(2048),
    label: z.string().max(256),
    mode: z.enum(['generated', 'fixed', 'skip']),
    value: z.string().max(4096).default(''),
    case: recipeCaseSchema.default('valid'),
  })
  .strict()
export const recipeSchema = z
  .object({
    version: z.literal(1),
    engineVersion: z.literal(1),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    origin: z
      .string()
      .url()
      .refine((v) => /^https?:\/\/[^/]+$/.test(v), 'Use an HTTP(S) origin without a path.'),
    pathname: z.string().startsWith('/').max(2048),
    formKey: z.string().min(1).max(32000),
    seed: z.string().trim().min(1).max(128),
    locale: z.enum(['en-US', 'en-GB', 'sr-RS']),
    onlyEmpty: z.boolean().default(true),
    rules: z.array(recipeRuleSchema).min(1).max(300),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    if (new Set(recipe.rules.map((r) => r.fieldKey)).size !== recipe.rules.length)
      ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Field identities must be unique.' })
  })
export type FillRecipe = z.infer<typeof recipeSchema>
export type RecipeRule = z.infer<typeof recipeRuleSchema>
export const recipeExportSchema = z
  .object({
    format: z.literal('quikfill-recipes'),
    version: z.literal(1),
    recipes: z.array(recipeSchema).min(1).max(100),
  })
  .strict()
export const recipeContextSchema = z.object({
  origin: z.string(),
  pathname: z.string(),
  formKey: z.string(),
  label: z.string(),
  fields: z.array(detectedFieldSchema),
})
export type RecipeContext = z.infer<typeof recipeContextSchema>

export const recipeContextsSchema = z.array(recipeContextSchema)
