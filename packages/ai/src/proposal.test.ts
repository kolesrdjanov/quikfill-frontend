import { describe, expect, it } from 'vitest'
import { detectedFieldSchema, type AiSuggestion, type DetectedField } from '@quikfill/schemas'
import { suggestionToProposal } from './proposal'

function field(partial: Partial<DetectedField> & { id: string }): DetectedField {
  return detectedFieldSchema.parse({
    tagName: 'input',
    inputType: 'text',
    domFingerprint: 'fp',
    ...partial,
  })
}

function suggestion(partial: Partial<AiSuggestion> & { fieldId: string }): AiSuggestion {
  return { semanticType: 'email', confidence: 0.8, reasons: [], ...partial }
}

describe('suggestionToProposal', () => {
  it('prefers the user saved data (recordField) over everything when a record matches', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'person.firstName' }),
      field({ id: 'a' }),
      { entityTypeId: 'person', recordId: 'r1', fieldKey: 'firstName' },
    )
    expect(proposal.fillSource).toEqual({
      sourceType: 'recordField',
      entityTypeId: 'person',
      recordId: 'r1',
      fieldKey: 'firstName',
    })
    expect(proposal.generatorRule).toBeNull()
  })

  it('does NOT fall back to sample/generated data by default — it leaves an advisory aiGenerated placeholder', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'person.firstName', confidence: 0.82 }),
      field({ id: 'a' }),
    )
    expect(proposal.fillSource).toEqual({ sourceType: 'aiGenerated', hint: 'person.firstName' })
    expect(proposal.generatorRule).toBeNull()
    expect(proposal.confidence).toBe(0.82)
    expect(proposal.fillStrategy).toBe('nativeInput')
  })

  it('uses a generator (clearly-labeled sample data) only when the caller opts in', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'person.firstName' }),
      field({ id: 'a' }),
      null,
      { allowSampleData: true },
    )
    expect(proposal.fillSource).toEqual({
      sourceType: 'generatorRule',
      ruleKey: 'person.firstName',
    })
    expect(proposal.generatorRule?.kind).toBe('person')
  })

  it('leaves an unknown type as aiGenerated even when sample data is allowed (no generator maps)', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'unknown' }),
      field({ id: 'a' }),
      null,
      { allowSampleData: true },
    )
    expect(proposal.fillSource).toEqual({ sourceType: 'aiGenerated', hint: 'unknown' })
    expect(proposal.generatorRule).toBeNull()
  })

  it('infers the fill strategy from the field type', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'enum' }),
      field({ id: 'a', inputType: 'select', tagName: 'select' }),
      null,
      { allowSampleData: true },
    )
    expect(proposal.fillStrategy).toBe('select')
  })
})
