// Regressions discovered by the 2026-10-22 audit. Pending capabilities stay explicit.
import { beforeEach, describe, expect, it } from 'vitest'
import type { CustomWidget, FillInstruction } from '@quikfill/schemas'
import { scanForms } from './scan'
import { applyFill } from './fill'
import { openOptionNodes } from './widget-dom'
import { valuesMatch } from './mask'
import { valuesToFillInstructions } from '../../ai/src/fill-request'

const widget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: [],
  valueDisplaySelectorCandidates: [],
  optionItemSelector: '[role="option"]',
  optionsOpenOnDemand: true,
  isSearchable: false,
  isVirtualized: false,
}
function instruction(
  id: string,
  value: string,
  extra: Partial<FillInstruction> = {},
): FillInstruction {
  return {
    detectedFieldId: id,
    selectorCandidates: [`#${id}`],
    frame: 'main',
    shadow: false,
    tagName: 'input',
    inputType: 'text',
    fillStrategy: 'nativeInput',
    proposedValue: value,
    ...extra,
  }
}
beforeEach(() => {
  document.body.innerHTML = ''
})

describe('audit regressions', () => {
  it('A01: input combobox retains custom widget semantics', () => {
    document.body.innerHTML =
      '<label for="country">Country</label><input id="country" role="combobox" aria-controls="countries" />'
    const [field] = scanForms().fields
    expect(field.inputType).toBe('customSelect')
    expect(field.customWidget?.kind).toBe('select')
  })
  it.todo('A02: detect and drive ARIA-only checkbox and switch adapters (Phase 2)')
  it('A03: two forms with the same radio name have separate groups', () => {
    document.body.innerHTML =
      '<form><label><input type="radio" name="status" value="a">A</label></form><form><label><input type="radio" name="status" value="b">B</label></form>'
    const fields = scanForms().fields
    expect(fields).toHaveLength(2)
    expect(fields[0].options).toHaveLength(1)
  })
  it('A04: invalid constrained number is reported as failed', async () => {
    document.body.innerHTML = '<input id="age" type="number" min="18" max="99" />'
    const outcome = await applyFill([instruction('age', '200', { inputType: 'number' })])
    expect((document.getElementById('age') as HTMLInputElement).validity.valid).toBe(false)
    expect(outcome.results[0].status).toBe('failed')
  })
  it('A05: datepicker never activates a generic form submit', async () => {
    document.body.innerHTML =
      '<form><input id="date" readonly /><div class="current-month">June 2032</div><button type="button" role="gridcell" aria-label="June 15, 2032">15</button><button type="submit">Save</button></form>'
    let submissions = 0
    document.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      submissions++
    })
    await applyFill([
      instruction('date', '2032-06-15', {
        fillStrategy: 'customSelect',
        customWidget: { ...widget, kind: 'datepicker' },
      }),
    ])
    expect(submissions).toBe(0)
  })
  it('A06: wrong month is not accepted as the requested date', async () => {
    document.body.innerHTML = '<input id="date" />'
    const input = document.getElementById('date') as HTMLInputElement
    input.addEventListener('input', () => {
      input.value = '2032-07-15'
    })
    const outcome = await applyFill([
      instruction('date', '2032-06-15', {
        fillStrategy: 'customSelect',
        customWidget: { ...widget, kind: 'datepicker' },
      }),
    ])
    expect(outcome.results[0].status).not.toBe('success')
  })
  it('A07: option discovery rejects a foreign hidden list', () => {
    document.body.innerHTML =
      '<div id="widget"><button type="button" role="combobox">Country</button></div><div hidden><div role="option">Delete</div></div>'
    const root = document.getElementById('widget')!
    expect(
      openOptionNodes(widget, root, root.firstElementChild!, document).map((n) => n.textContent),
    ).toEqual([])
  })
  it('A08: live AI instruction builder preserves Google Places assisted strategy', () => {
    document.body.innerHTML = '<input id="address" class="pac-target-input" />'
    const [field] = scanForms().fields
    expect(field.autocompleteHint).toBe('googlePlaces')
    expect(
      valuesToFillInstructions([{ fieldId: field.id, value: 'Main Street' }], [field])[0]
        .fillStrategy,
    ).toBe('assistedAutocomplete')
  })
  it('A09: shadow rescan removes stale markers and fills the live control', async () => {
    document.body.innerHTML = '<div id="host"></div>'
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<input id="old" aria-label="Old" /><input id="live" aria-label="Live" />'
    scanForms()
    shadow.querySelector('input')!.disabled = true
    const [field] = scanForms().fields
    expect(shadow.querySelector('#old')!.getAttribute('data-qf-id')).toBeNull()
    const outcome = await applyFill(
      valuesToFillInstructions([{ fieldId: field.id, value: 'hello' }], [field]),
    )
    expect(outcome.results[0].status).toBe('success')
    expect((shadow.querySelector('#live') as HTMLInputElement).value).toBe('hello')
  })
  it('A10: fieldset-disabled input is excluded and never written', async () => {
    document.body.innerHTML =
      '<fieldset disabled><input id="disabled" aria-label="Name" /></fieldset>'
    expect(scanForms().fields).toHaveLength(0)
    const outcome = await applyFill([instruction('disabled', 'hello')])
    expect(outcome.results[0].status).toBe('skipped')
  })
  it('A11: unmasked values preserve signs and significant characters', () => {
    expect(valuesMatch('-100', '100')).toBe(false)
    expect(valuesMatch('Secret!', 'secret')).toBe(false)
  })
  it.todo('A12: forward minlength/maxlength in the AI contract (Phase 1)')
  it('A13: an unrelated display change is not a successful custom selection', async () => {
    document.body.innerHTML =
      '<div id="country"><button type="button" role="combobox">Choose</button><div role="option">Serbia</div></div>'
    const root = document.getElementById('country')!
    root.querySelector('[role="option"]')!.addEventListener('click', () => {
      root.querySelector('button')!.textContent = 'Loading…'
    })
    const outcome = await applyFill([
      instruction('country', 'Serbia', {
        tagName: 'div',
        inputType: 'customSelect',
        fillStrategy: 'customSelect',
        customWidget: widget,
      }),
    ])
    expect(root.querySelector('button')!.textContent).toBe('Loading…')
    expect(outcome.results[0].status).toBe('failed')
  })
})
