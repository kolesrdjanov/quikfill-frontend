import { describe, expect, it } from 'vitest'
import {
  createDomainInputSchema,
  createFieldMappingInputSchema,
  createFormProfileInputSchema,
} from './inputs'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('create input schemas — optional client id', () => {
  it('accepts a domain create with a client-supplied id (idempotent push)', () => {
    const parsed = createDomainInputSchema.parse({
      id: UUID,
      name: 'Acme',
      hostnames: ['acme.com'],
    })
    expect(parsed.id).toBe(UUID)
  })

  it('accepts a domain create without an id (server assigns)', () => {
    const parsed = createDomainInputSchema.parse({ name: 'Acme', hostnames: ['acme.com'] })
    expect(parsed.id).toBeUndefined()
  })

  it('rejects a non-uuid id', () => {
    expect(() =>
      createDomainInputSchema.parse({ id: 'not-a-uuid', name: 'Acme', hostnames: [] }),
    ).toThrow()
  })

  it('accepts a form profile create with or without an id', () => {
    const base = { domainId: UUID, name: 'Checkout', urlPatterns: [], pageTitlePatterns: [] }
    expect(createFormProfileInputSchema.parse({ ...base, id: UUID }).id).toBe(UUID)
    expect(createFormProfileInputSchema.parse(base).id).toBeUndefined()
  })

  it('accepts a field mapping create with an id but still omits formProfileId', () => {
    const parsed = createFieldMappingInputSchema.parse({
      id: UUID,
      fieldFingerprint: 'fp',
      selectorCandidates: ['#a'],
      target: { selectorCandidates: ['#a'], fieldFingerprint: 'fp' },
      fillSource: { sourceType: 'staticValue', value: 'x' },
      fillStrategy: 'nativeInput',
      confidence: 0.5,
    })
    expect(parsed.id).toBe(UUID)
    expect('formProfileId' in parsed).toBe(false)
  })
})
