import { describe, expect, it } from 'vitest'
import { customWidgetSchema } from './detected-field'

describe('customWidgetSchema', () => {
  it('applies defaults for kind and the boolean flags', () => {
    const w = customWidgetSchema.parse({ optionItemSelector: '[role="option"]' })
    expect(w.kind).toBe('select')
    expect(w.optionsOpenOnDemand).toBe(true)
    expect(w.isSearchable).toBe(false)
    expect(w.isVirtualized).toBe(false)
    expect(w.triggerSelectorCandidates).toEqual([])
  })

  it('accepts the multiselect and datepicker kinds', () => {
    expect(customWidgetSchema.parse({ optionItemSelector: 'x', kind: 'multiselect' }).kind).toBe(
      'multiselect',
    )
    expect(customWidgetSchema.parse({ optionItemSelector: 'x', kind: 'datepicker' }).kind).toBe(
      'datepicker',
    )
  })

  it('round-trips the portal/search/value-attr fields', () => {
    const w = customWidgetSchema.parse({
      optionItemSelector: '[role="option"]',
      listboxId: 'lb-1',
      searchInputSelector: '#q',
      optionValueAttr: 'data-value',
      isSearchable: true,
      isVirtualized: true,
    })
    expect(w.listboxId).toBe('lb-1')
    expect(w.searchInputSelector).toBe('#q')
    expect(w.optionValueAttr).toBe('data-value')
    expect(w.isSearchable).toBe(true)
  })

  it('normalizes null nullable fields to undefined (backend serializes absent as null)', () => {
    const w = customWidgetSchema.parse({
      optionItemSelector: 'x',
      listboxId: null,
      searchInputSelector: null,
      optionValueAttr: null,
    })
    expect(w.listboxId).toBeUndefined()
    expect(w.searchInputSelector).toBeUndefined()
    expect(w.optionValueAttr).toBeUndefined()
  })
})
