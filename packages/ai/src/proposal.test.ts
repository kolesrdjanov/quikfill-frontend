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
  it('maps a generator-backed semantic type to a generatorRule source', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'person.firstName', confidence: 0.82 }),
      field({ id: 'a' }),
    )
    expect(proposal.fillSource).toEqual({
      sourceType: 'generatorRule',
      ruleKey: 'person.firstName',
    })
    expect(proposal.generatorRule?.kind).toBe('person')
    expect(proposal.confidence).toBe(0.82)
    expect(proposal.fillStrategy).toBe('nativeInput')
  })

  it('maps a website/URL suggestion to the url generator (not a dead aiGenerated source)', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'url', confidence: 0.9 }),
      field({ id: 'a' }),
    )
    expect(proposal.fillSource).toEqual({ sourceType: 'generatorRule', ruleKey: 'url' })
    expect(proposal.generatorRule?.kind).toBe('url')
  })

  it('falls back to an advisory aiGenerated source when no generator maps', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'unknown' }),
      field({ id: 'a' }),
    )
    expect(proposal.fillSource).toEqual({ sourceType: 'aiGenerated', hint: 'unknown' })
    expect(proposal.generatorRule).toBeNull()
  })

  it('prefers the user saved data (recordField) over a generator when a record matches', () => {
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

  it('infers the fill strategy from the field type', () => {
    const proposal = suggestionToProposal(
      suggestion({ fieldId: 'a', semanticType: 'enum' }),
      field({ id: 'a', inputType: 'select', tagName: 'select' }),
    )
    expect(proposal.fillStrategy).toBe('select')
  })
})
