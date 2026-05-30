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
 * The closed vocabulary the client can turn into a value. MUST stay in lockstep
 * with `KIND_BY_SEMANTIC` in `@quikfill/autofill-core` (`classify.ts`) and the
 * backend `SEMANTIC_TYPES` (`services/.../ai/domain/semantic-types.ts`) — a
 * `semanticType` outside this set has no generator and resolves to "no value to
 * fill", so it must never reach the planner. `unknown` is the explicit fallback.
 */
export const SEMANTIC_TYPES = [
  'email',
  'phone',
  'person.firstName',
  'person.lastName',
  'person.fullName',
  'company',
  'url',
  'address.line1',
  'address.city',
  'address.state',
  'address.zip',
  'address.country',
  'unit',
  'number',
  'date',
  'currency',
  'boolean',
  'enum',
  'notes',
  'taxId',
  'ssn',
  'username',
  'masked',
  'unknown',
] as const
export const semanticTypeSchema = z.enum(SEMANTIC_TYPES)
export type SemanticType = z.infer<typeof semanticTypeSchema>

function squash(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, '')
}
const CANONICAL_BY_SQUASHED = new Map<string, SemanticType>(
  SEMANTIC_TYPES.map((t) => [squash(t), t]),
)
/** Common model-drift / autocomplete-token spellings → the canonical vocabulary. */
const SEMANTIC_ALIASES: Record<string, SemanticType> = {
  emailaddress: 'email',
  tel: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  firstname: 'person.firstName',
  givenname: 'person.firstName',
  fname: 'person.firstName',
  lastname: 'person.lastName',
  familyname: 'person.lastName',
  surname: 'person.lastName',
  lname: 'person.lastName',
  fullname: 'person.fullName',
  name: 'person.fullName',
  organization: 'company',
  organisation: 'company',
  employer: 'company',
  business: 'company',
  website: 'url',
  homepage: 'url',
  street: 'address.line1',
  streetaddress: 'address.line1',
  addressline1: 'address.line1',
  address: 'address.line1',
  city: 'address.city',
  town: 'address.city',
  addresslevel2: 'address.city',
  state: 'address.state',
  province: 'address.state',
  region: 'address.state',
  addresslevel1: 'address.state',
  zip: 'address.zip',
  zipcode: 'address.zip',
  postalcode: 'address.zip',
  postcode: 'address.zip',
  countryname: 'address.country',
  apartment: 'unit',
  suite: 'unit',
  apt: 'unit',
  amount: 'currency',
  price: 'currency',
  salary: 'currency',
  dob: 'date',
  birthdate: 'date',
  birthday: 'date',
  qty: 'number',
  quantity: 'number',
  count: 'number',
  message: 'notes',
  comment: 'notes',
  comments: 'notes',
  bio: 'notes',
  description: 'notes',
  ein: 'taxId',
  fein: 'taxId',
  employeridentificationnumber: 'taxId',
  socialsecurity: 'ssn',
  socialsecuritynumber: 'ssn',
  handle: 'username',
  nickname: 'username',
  screenname: 'username',
  displayname: 'username',
  alias: 'username',
}

/**
 * Coerce an untrusted `semanticType` into the closed vocabulary: exact match →
 * kept, a known spelling drift → its canonical key, anything else (or a
 * non-string) → `unknown`. Mirrors the backend coercion — defence in depth, so
 * an off-list value can never silently resolve to "no value to fill".
 */
export function normalizeSemanticType(raw: unknown): SemanticType {
  if (typeof raw !== 'string') return 'unknown'
  const key = squash(raw)
  return CANONICAL_BY_SQUASHED.get(key) ?? SEMANTIC_ALIASES[key] ?? 'unknown'
}

/**
 * AI output — untrusted. Every response is validated against this before use,
 * and surfaced to the user as a reviewable/rejectable suggestion (never applied).
 * `semanticType` is coerced into the closed vocabulary so a hallucinated value is
 * normalized (kept as a usable suggestion) rather than dropped or left to dead-end.
 */
export const aiSuggestionSchema = z.object({
  fieldId: z.string().min(1),
  semanticType: z.preprocess(normalizeSemanticType, semanticTypeSchema),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
})
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>
