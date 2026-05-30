import { describe, expect, it } from 'vitest'
import type { GeneratorRule } from '@quikfill/schemas'
import { defaultSourceFor, isSensitiveSemanticType } from './source-policy'

const genRule = (key: string): GeneratorRule => ({ fieldKey: key, kind: 'patterned' })
const match = { entityTypeId: 'identity', recordId: 'r1', fieldKey: 'email' }

describe('isSensitiveSemanticType', () => {
  it('flags ssn and taxId, not ordinary types', () => {
    expect(isSensitiveSemanticType('ssn')).toBe(true)
    expect(isSensitiveSemanticType('taxId')).toBe(true)
    expect(isSensitiveSemanticType('email')).toBe(false)
  })
})

describe('defaultSourceFor', () => {
  it('prefers a saved record over everything', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: true,
      recordMatch: match,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource.sourceType).toBe('recordField')
    expect(r.rule).toBeNull()
  })
  it('samples an ordinary type when sample data is allowed', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: true,
      recordMatch: null,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource).toEqual({ sourceType: 'generatorRule', ruleKey: 'email' })
    expect(r.rule).toEqual(genRule('email'))
  })
  it('never samples a sensitive type — leaves it for the user', () => {
    const r = defaultSourceFor({
      semanticType: 'ssn',
      allowSampleData: true,
      recordMatch: null,
      generatorRule: genRule('ssn'),
    })
    expect(r.fillSource).toEqual({ sourceType: 'aiGenerated', hint: 'ssn' })
    expect(r.rule).toBeNull()
  })
  it('leaves an ordinary type for the user when sample data is off', () => {
    const r = defaultSourceFor({
      semanticType: 'email',
      allowSampleData: false,
      recordMatch: null,
      generatorRule: genRule('email'),
    })
    expect(r.fillSource.sourceType).toBe('aiGenerated')
  })
})
