import type { DetectedField, GeneratorKind, GeneratorRule } from '@quikfill/schemas'

export interface FieldClassification {
  fieldId: string
  /** Dotted semantic label, e.g. `email`, `person.firstName`, `address.zip`. */
  semanticType: string
  /** 0–1 heuristic confidence. */
  confidence: number
  /** Default generator kind for this semantic type, or null if unknown. */
  suggestedKind: GeneratorKind | null
  generatorOptions?: Record<string, unknown>
}

/** Map a semantic type to its default generator kind + options. */
const KIND_BY_SEMANTIC: Record<string, { kind: GeneratorKind; options?: Record<string, unknown> }> =
  {
    email: { kind: 'email' },
    phone: { kind: 'phone' },
    'person.firstName': { kind: 'person', options: { part: 'first' } },
    'person.lastName': { kind: 'person', options: { part: 'last' } },
    'person.fullName': { kind: 'person', options: { part: 'full' } },
    company: { kind: 'company' },
    'address.line1': { kind: 'address', options: { part: 'line1' } },
    'address.city': { kind: 'address', options: { part: 'city' } },
    'address.state': { kind: 'address', options: { part: 'state' } },
    'address.zip': { kind: 'address', options: { part: 'zip' } },
    'address.country': { kind: 'address', options: { part: 'country' } },
    unit: { kind: 'unit' },
    number: { kind: 'number' },
    date: { kind: 'date' },
    currency: { kind: 'currency' },
    boolean: { kind: 'boolean' },
    enum: { kind: 'selectOption' },
    notes: { kind: 'notes' },
  }

/** Standard autocomplete tokens → semantic type (strongest signal). */
const AUTOCOMPLETE_MAP: Record<string, string> = {
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'given-name': 'person.firstName',
  'family-name': 'person.lastName',
  name: 'person.fullName',
  organization: 'company',
  'street-address': 'address.line1',
  'address-line1': 'address.line1',
  'address-level2': 'address.city',
  'address-level1': 'address.state',
  'postal-code': 'address.zip',
  country: 'address.country',
  'country-name': 'address.country',
  url: 'url',
}

interface KeywordRule {
  semanticType: string
  re: RegExp
  confidence: number
}

// Ordered: more specific patterns first.
const KEYWORD_RULES: KeywordRule[] = [
  { semanticType: 'email', re: /e-?mail/, confidence: 0.85 },
  { semanticType: 'phone', re: /phone|mobile|\btel\b/, confidence: 0.85 },
  { semanticType: 'person.firstName', re: /first.?name|given.?name|\bfname\b/, confidence: 0.85 },
  {
    semanticType: 'person.lastName',
    re: /last.?name|surname|family.?name|\blname\b/,
    confidence: 0.85,
  },
  { semanticType: 'person.fullName', re: /full.?name|your name|\bname\b/, confidence: 0.6 },
  { semanticType: 'company', re: /company|organi[sz]ation|employer|business/, confidence: 0.8 },
  { semanticType: 'address.zip', re: /zip|postal/, confidence: 0.85 },
  { semanticType: 'address.city', re: /\bcity\b|town/, confidence: 0.8 },
  { semanticType: 'address.state', re: /\bstate\b|province|region/, confidence: 0.75 },
  { semanticType: 'address.country', re: /country/, confidence: 0.8 },
  { semanticType: 'unit', re: /\bapt\b|apartment|\bunit\b|suite/, confidence: 0.75 },
  { semanticType: 'address.line1', re: /address|street/, confidence: 0.75 },
  { semanticType: 'url', re: /website|\burl\b|homepage/, confidence: 0.8 },
  { semanticType: 'currency', re: /price|salary|cost|currency|amount/, confidence: 0.7 },
  { semanticType: 'date', re: /date|\bdob\b|birth/, confidence: 0.75 },
  { semanticType: 'number', re: /number|\bqty\b|quantity|count/, confidence: 0.65 },
  { semanticType: 'notes', re: /message|comment|\bnote|\bbio\b|description/, confidence: 0.7 },
]

function classification(
  fieldId: string,
  semanticType: string,
  confidence: number,
): FieldClassification {
  const mapped = KIND_BY_SEMANTIC[semanticType]
  return {
    fieldId,
    semanticType,
    confidence,
    suggestedKind: mapped?.kind ?? null,
    generatorOptions: mapped?.options,
  }
}

/** Heuristically classify one field. Deterministic; no AI, no network. */
export function classifyField(field: DetectedField): FieldClassification {
  const type = field.inputType.toLowerCase()

  if (type === 'select' || (field.options?.length ?? 0) > 0) {
    return classification(field.id, 'enum', 0.9)
  }
  if (type === 'checkbox' || type === 'radio') {
    return classification(field.id, 'boolean', 0.85)
  }

  const ac = field.autocomplete?.toLowerCase().trim()
  if (ac && AUTOCOMPLETE_MAP[ac]) {
    return classification(field.id, AUTOCOMPLETE_MAP[ac], 0.95)
  }

  if (type === 'email') return classification(field.id, 'email', 0.9)
  if (type === 'tel') return classification(field.id, 'phone', 0.9)
  if (type === 'date') return classification(field.id, 'date', 0.9)

  const haystack = [field.name, field.domId, field.labelText, field.placeholder, field.ariaLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(haystack)) return classification(field.id, rule.semanticType, rule.confidence)
  }

  if (type === 'number') return classification(field.id, 'number', 0.7)
  if (field.tagName === 'textarea') return classification(field.id, 'notes', 0.6)

  return classification(field.id, 'unknown', 0.2)
}

/** Classify every detected field. */
export function classifyFields(fields: DetectedField[]): FieldClassification[] {
  return fields.map(classifyField)
}

/**
 * Rebuild the default GeneratorRule for a semantic type. Lets saved mappings
 * that reference `generatorRule` with `ruleKey = semanticType` resolve again in
 * a later session without persisting the rule definition.
 */
export function generatorRuleForSemanticType(semanticType: string): GeneratorRule | null {
  const mapped = KIND_BY_SEMANTIC[semanticType]
  if (!mapped) return null
  return { fieldKey: semanticType, kind: mapped.kind, options: mapped.options }
}
