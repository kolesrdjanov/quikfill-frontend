import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, type DetectedField } from '@quikfill/schemas'
import { classifyField } from './classify'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

describe('classifyField', () => {
  it('trusts the autocomplete token most', () => {
    const c = classifyField(field({ id: 'a', autocomplete: 'email', name: 'whatever' }))
    expect(c.semanticType).toBe('email')
    expect(c.confidence).toBeGreaterThanOrEqual(0.95)
    expect(c.suggestedKind).toBe('email')
  })

  it('classifies by name/label keywords', () => {
    expect(classifyField(field({ id: 'a', name: 'first_name' })).semanticType).toBe(
      'person.firstName',
    )
    expect(classifyField(field({ id: 'b', labelText: 'Email address' })).semanticType).toBe('email')
    expect(classifyField(field({ id: 'c', name: 'postal_code' })).semanticType).toBe('address.zip')
    expect(classifyField(field({ id: 'd', labelText: 'Company' })).suggestedKind).toBe('company')
  })

  it('treats selects as enums and checkboxes as booleans', () => {
    const sel = classifyField(
      field({
        id: 'a',
        inputType: 'select',
        tagName: 'select',
        options: [{ value: 'x', label: 'X' }],
      }),
    )
    expect(sel.semanticType).toBe('enum')
    expect(sel.suggestedKind).toBe('selectOption')

    const custom = classifyField(
      field({
        id: 'cs',
        inputType: 'customSelect',
        tagName: 'div',
        options: [{ value: 'Locker', label: 'Locker' }],
      }),
    )
    expect(custom.semanticType).toBe('enum')
    expect(custom.suggestedKind).toBe('selectOption')

    const cb = classifyField(field({ id: 'b', inputType: 'checkbox' }))
    expect(cb.suggestedKind).toBe('boolean')
  })

  it('falls back to unknown with no suggestion', () => {
    const c = classifyField(field({ id: 'a', name: 'xyzzy', labelText: 'Mystery' }))
    expect(c.semanticType).toBe('unknown')
    expect(c.suggestedKind).toBeNull()
  })
})
