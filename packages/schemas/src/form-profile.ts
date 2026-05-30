import { z } from 'zod'
import { nullableOptional, timestamps, uuid } from './common'

/** A site/app grouping one or more form profiles. */
export const domainSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  hostnames: z.array(z.string()).default([]),
  description: nullableOptional(z.string()),
  ...timestamps,
})
export type Domain = z.infer<typeof domainSchema>

/** Structural signature of a form, used by the matcher beyond URL/title. */
export const structureMetadataSchema = z.object({
  sectionHeadings: z.array(z.string()).optional(),
  fieldCount: z.number().int().nonnegative().optional(),
  structureHash: z.string().optional(),
})
export type StructureMetadata = z.infer<typeof structureMetadataSchema>

/**
 * A saved form, matched to a page by hostname → urlPattern → pageTitle →
 * fingerprint → field-count proximity → structure similarity. Never URL-only.
 */
export const formProfileSchema = z.object({
  id: uuid,
  domainId: uuid,
  name: z.string().min(1),
  urlPatterns: z.array(z.string()).default([]),
  pageTitlePatterns: z.array(z.string()).default([]),
  fieldFingerprintHash: nullableOptional(z.string()),
  structureMetadata: nullableOptional(structureMetadataSchema),
  ...timestamps,
})
export type FormProfile = z.infer<typeof formProfileSchema>

/** Request body for `POST /form-profiles/match`. */
export const formProfileMatchInputSchema = z.object({
  hostname: z.string(),
  url: z.string(),
  pageTitle: z.string().optional(),
  fieldFingerprintHash: z.string().optional(),
  fieldCount: z.number().int().nonnegative().optional(),
})
export type FormProfileMatchInput = z.infer<typeof formProfileMatchInputSchema>

/** One ranked candidate returned by the matcher. */
export const formProfileMatchCandidateSchema = z.object({
  formProfileId: uuid,
  score: z.number(),
  reasons: z.array(z.string()).default([]),
})
export type FormProfileMatchCandidate = z.infer<typeof formProfileMatchCandidateSchema>
