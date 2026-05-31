import type { AiFillField, AiFillRequest, AiFillResponse } from '@quikfill/schemas'

/**
 * Deterministic local stand-in for `POST /ai/fill`, gated behind a dev flag by the
 * background worker so the whole in-page flow can be exercised without calling
 * Gemini. Picks a plausible value per field from its `inputType` + label hints —
 * never random, so a given form always fills the same way in dev.
 */
export function mockAiFill(request: AiFillRequest): AiFillResponse {
  return {
    values: request.fields.map((field) => ({
      fieldId: field.fieldId,
      value: mockValue(field),
    })),
  }
}

function mockValue(field: AiFillField): string {
  // A select/enum with options: take the first non-empty option.
  if (field.options && field.options.length > 0) {
    return field.options.find((o) => o.trim() !== '') ?? field.options[0]
  }

  const type = field.inputType.toLowerCase()
  const hint = `${field.label ?? ''} ${field.name ?? ''} ${field.ariaLabel ?? ''} ${
    field.autocomplete ?? ''
  }`.toLowerCase()
  const has = (...words: string[]) => words.some((w) => hint.includes(w))

  if (type === 'email' || has('email')) return 'jane.doe@example.com'
  if (type === 'tel' || has('phone', 'mobile', 'tel')) return '+1 555 010 1234'
  if (type === 'url' || has('website', 'url')) return 'https://example.com'
  if (type === 'password') return 'Str0ng-Passw0rd!'
  if (type === 'date' || has('birth', 'dob', 'date')) return '1990-01-01'
  if (type === 'number' || has('quantity', 'qty', 'amount', 'count')) return '1'
  if (type === 'checkbox') return 'true'

  if (has('first name', 'given')) return 'Jane'
  if (has('last name', 'surname', 'family')) return 'Doe'
  if (has('full name', 'your name') || hint.trim() === 'name') return 'Jane Doe'
  if (has('company', 'organization', 'organisation', 'employer')) return 'Acme Inc.'
  if (has('city', 'town')) return 'Springfield'
  if (has('state', 'province', 'region')) return 'CA'
  if (has('zip', 'postal', 'postcode')) return '94016'
  if (has('country')) return 'United States'
  if (has('address', 'street')) return '123 Main St'
  if (has('username', 'handle', 'nickname')) return 'janedoe'
  if (has('message', 'comment', 'bio', 'notes', 'description') || type === 'textarea') {
    return 'This is a sample message generated for testing.'
  }
  if (has('name')) return 'Jane Doe'

  return 'Sample value'
}
