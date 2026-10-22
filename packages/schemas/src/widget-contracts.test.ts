import { describe, expect, it } from 'vitest'
import { fillInstructionSchema, undoSnapshotSchema } from './fill'
import { customWidgetSchema } from './detected-field'
describe('widget execution contracts', () => {
  it('preserves structured multi-values in instructions and undo snapshots', () => {
    const instruction = fillInstructionSchema.parse({
      detectedFieldId: 'field',
      selectorCandidates: [],
      tagName: 'div',
      inputType: 'customSelect',
      fillStrategy: 'customSelect',
      proposedValue: 'Doe, Jane',
      proposedValues: ['Doe, Jane'],
    })
    expect(instruction.proposedValues).toEqual(['Doe, Jane'])
    const snapshot = undoSnapshotSchema.parse({
      entries: [
        {
          detectedFieldId: 'field',
          selectorCandidates: [],
          previousValue: null,
          previousSelectedValues: [],
          appliedSelectedValues: ['Doe, Jane'],
        },
      ],
    })
    expect(snapshot.entries[0].appliedSelectedValues).toEqual(['Doe, Jane'])
  })
  it('validates explicit calendar format and remains compatible with old widget descriptors', () => {
    expect(
      customWidgetSchema.parse({ optionItemSelector: '[role=option]' }).dateFormat,
    ).toBeUndefined()
    expect(
      customWidgetSchema.safeParse({
        optionItemSelector: '[role=gridcell]',
        kind: 'datepicker',
        dateFormat: 'DD.MM.YYYY',
      }).success,
    ).toBe(true)
    expect(
      customWidgetSchema.safeParse({ optionItemSelector: '[role=gridcell]', dateFormat: 'guess' })
        .success,
    ).toBe(false)
  })
})
