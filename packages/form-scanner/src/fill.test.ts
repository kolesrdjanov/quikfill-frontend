import { beforeEach, describe, expect, it } from 'vitest'
import type { CustomWidget, FillInstruction } from '@quikfill/schemas'
import { applyFill, applyUndo } from './fill'

function instruction(
  partial: Partial<FillInstruction> & { detectedFieldId: string },
): FillInstruction {
  return {
    selectorCandidates: [`#${partial.detectedFieldId}`],
    frame: 'main',
    shadow: false,
    tagName: 'input',
    inputType: 'text',
    fillStrategy: 'nativeInput',
    proposedValue: '',
    ...partial,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('applyFill', () => {
  it('fills a native input and verifies the value', async () => {
    document.body.innerHTML = '<input id="email" value="old" />'
    const { results, undoSnapshot } = await applyFill([
      instruction({ detectedFieldId: 'email', proposedValue: 'new@x.com' }),
    ])
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('new@x.com')
    expect(results[0]).toMatchObject({ status: 'success', acceptedValue: 'new@x.com' })
    expect(undoSnapshot.entries[0].previousValue).toBe('old')
  })

  it('dispatches input/change events', async () => {
    document.body.innerHTML = '<input id="a" />'
    const seen: string[] = []
    const el = document.getElementById('a')!
    el.addEventListener('input', () => seen.push('input'))
    el.addEventListener('change', () => seen.push('change'))
    await applyFill([instruction({ detectedFieldId: 'a', proposedValue: 'x' })])
    expect(seen).toContain('input')
    expect(seen).toContain('change')
  })

  it('toggles a checkbox', async () => {
    document.body.innerHTML = '<input id="agree" type="checkbox" />'
    await applyFill([
      instruction({
        detectedFieldId: 'agree',
        inputType: 'checkbox',
        fillStrategy: 'clickToggle',
        proposedValue: 'true',
      }),
    ])
    expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(true)
  })

  it('sets a native select to a valid option', async () => {
    document.body.innerHTML =
      '<select id="role"><option value="admin">A</option><option value="user">U</option></select>'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'role',
        tagName: 'select',
        inputType: 'select',
        fillStrategy: 'select',
        proposedValue: 'user',
      }),
    ])
    expect((document.getElementById('role') as HTMLSelectElement).value).toBe('user')
    expect(results[0].status).toBe('success')
  })

  it('fails when a value is not accepted (invalid select option)', async () => {
    document.body.innerHTML = '<select id="role"><option value="admin">A</option></select>'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'role',
        tagName: 'select',
        inputType: 'select',
        fillStrategy: 'select',
        proposedValue: 'ghost',
      }),
    ])
    expect(results[0].status).toBe('failed')
  })

  it('resolves a native select by its option LABEL when the proposed value is a label', async () => {
    document.body.innerHTML =
      '<select id="role"><option value="admin">Administrator</option><option value="user">Standard User</option></select>'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'role',
        tagName: 'select',
        inputType: 'select',
        fillStrategy: 'select',
        // A saved-record/AI value is often a human label, not the option value.
        proposedValue: 'Standard User',
      }),
    ])
    expect((document.getElementById('role') as HTMLSelectElement).value).toBe('user')
    expect(results[0]).toMatchObject({ status: 'success', acceptedValue: 'user' })
  })

  it('matches a select option label case- and whitespace-insensitively', async () => {
    document.body.innerHTML =
      '<select id="c"><option value="ca">Canada</option><option value="us">United States</option></select>'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'c',
        tagName: 'select',
        inputType: 'select',
        fillStrategy: 'select',
        proposedValue: '  united states ',
      }),
    ])
    expect((document.getElementById('c') as HTMLSelectElement).value).toBe('us')
    expect(results[0].status).toBe('success')
  })

  it('skips missing, disabled, and read-only fields', async () => {
    document.body.innerHTML = '<input id="ro" readonly /><input id="dis" disabled />'
    const { results } = await applyFill([
      instruction({ detectedFieldId: 'missing', proposedValue: 'x' }),
      instruction({ detectedFieldId: 'ro', proposedValue: 'x' }),
      instruction({ detectedFieldId: 'dis', proposedValue: 'x' }),
    ])
    expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(results[0].reason).toMatch(/not found/i)
    expect(results[1].reason).toMatch(/read-only/i)
    expect(results[2].reason).toMatch(/disabled/i)
  })

  it('skips a field with no proposed value instead of reporting success', async () => {
    document.body.innerHTML = '<input id="note" value="" />'
    const { results, undoSnapshot } = await applyFill([
      instruction({ detectedFieldId: 'note', proposedValue: '' }),
    ])
    expect(results[0].status).toBe('skipped')
    expect(results[0].reason).toMatch(/no value|nothing to fill/i)
    // Nothing was written, so there is nothing to undo.
    expect(undoSnapshot.entries).toHaveLength(0)
    expect((document.getElementById('note') as HTMLInputElement).value).toBe('')
  })

  it('skips a whitespace-only proposed value', async () => {
    document.body.innerHTML = '<input id="ws" value="keep" />'
    const { results } = await applyFill([
      instruction({ detectedFieldId: 'ws', proposedValue: '   ' }),
    ])
    expect(results[0].status).toBe('skipped')
    // The existing value is left untouched.
    expect((document.getElementById('ws') as HTMLInputElement).value).toBe('keep')
  })

  it('fills a mask-formatted input without a false failure (maska-style)', async () => {
    document.body.innerHTML = '<input id="phone" type="tel" data-maska="(###) ###-####" />'
    const el = document.getElementById('phone') as HTMLInputElement
    // Simulate the maska directive: reformat to the mask on every input event.
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '').slice(0, 10)
      let out = ''
      const mask = '(###) ###-####'
      let di = 0
      for (const c of mask) {
        if (c === '#') {
          if (di >= digits.length) break
          out += digits[di++]
        } else {
          out += c
        }
      }
      el.value = out
    })
    const { results } = await applyFill([
      // Raw profile value with a country code — the mask would mangle it if written as-is.
      instruction({ detectedFieldId: 'phone', proposedValue: '+1-976-729-2722' }),
    ])
    expect(results[0].status).toBe('success')
    // Country code dropped; the national number landed correctly.
    expect(results[0].acceptedValue).toBe('(976) 729-2722')
    expect(el.value).toBe('(976) 729-2722')
  })

  it('assists an autocomplete field: types to open the dropdown, never blurs', async () => {
    document.body.innerHTML = '<input id="addr" class="pac-target-input" />'
    const el = document.getElementById('addr') as HTMLInputElement
    const seen: string[] = []
    for (const t of ['input', 'keydown', 'keyup', 'blur']) {
      el.addEventListener(t, () => seen.push(t))
    }
    const { results, undoSnapshot } = await applyFill([
      instruction({
        detectedFieldId: 'addr',
        fillStrategy: 'assistedAutocomplete',
        proposedValue: '742 Evergreen Terrace',
      }),
    ])
    expect(el.value).toBe('742 Evergreen Terrace')
    expect(results[0]).toMatchObject({ status: 'assisted', acceptedValue: '742 Evergreen Terrace' })
    expect(results[0].reason).toMatch(/pick the matching result/i)
    expect(seen).toContain('input')
    // Blur would close/clear the suggestion dropdown — it must not fire.
    expect(seen).not.toContain('blur')
    // Undo restores the field to its pre-fill (empty) value.
    expect(undoSnapshot.entries[0].previousValue).toBe('')
  })

  it('writes assisted-autocomplete fields after all regular fields (keeps dropdown open)', async () => {
    document.body.innerHTML = '<input id="addr" class="pac-target-input" /><input id="name" />'
    const order: string[] = []
    document.getElementById('addr')!.addEventListener('input', () => order.push('addr'))
    document.getElementById('name')!.addEventListener('input', () => order.push('name'))
    await applyFill([
      // Assisted field listed first, but must be applied last.
      instruction({
        detectedFieldId: 'addr',
        fillStrategy: 'assistedAutocomplete',
        proposedValue: '1 Main St',
      }),
      instruction({ detectedFieldId: 'name', proposedValue: 'Ada' }),
    ])
    expect(order).toEqual(['name', 'addr'])
  })

  it('fills a field inside a same-origin iframe (resolves across frame boundaries)', async () => {
    document.body.innerHTML = '<iframe id="f"></iframe>'
    const iframe = document.getElementById('f') as HTMLIFrameElement
    const innerDoc = iframe.contentDocument!
    innerDoc.body.innerHTML = '<input data-qf-id="qf-9" id="inner" value="old" />'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'qf-9',
        selectorCandidates: ['#inner'],
        frame: 'frame:0',
        proposedValue: 'in-frame@x.com',
      }),
    ])
    expect((innerDoc.getElementById('inner') as HTMLInputElement).value).toBe('in-frame@x.com')
    expect(results[0].status).toBe('success')
  })

  it('undoes a fill inside a same-origin iframe', async () => {
    document.body.innerHTML = '<iframe id="f"></iframe>'
    const innerDoc = (document.getElementById('f') as HTMLIFrameElement).contentDocument!
    innerDoc.body.innerHTML = '<input data-qf-id="qf-7" id="inner" value="keep" />'
    const { undoSnapshot } = await applyFill([
      instruction({
        detectedFieldId: 'qf-7',
        selectorCandidates: ['#inner'],
        frame: 'frame:0',
        proposedValue: 'changed',
      }),
    ])
    expect((innerDoc.getElementById('inner') as HTMLInputElement).value).toBe('changed')
    await applyUndo(undoSnapshot)
    expect((innerDoc.getElementById('inner') as HTMLInputElement).value).toBe('keep')
  })

  it('writes through a framework-controlled value setter', async () => {
    document.body.innerHTML = '<input id="react" />'
    const el = document.getElementById('react') as HTMLInputElement
    const nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
    // Simulate React: an instance-level setter that tracks but does NOT update
    // the native value. The getter still delegates to native.
    let instanceSetterCalls = 0
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() {
        return nativeDesc.get!.call(this)
      },
      set() {
        instanceSetterCalls++
      },
    })
    const { results } = await applyFill([
      instruction({ detectedFieldId: 'react', proposedValue: 'hello' }),
    ])
    // The prototype setter bypasses the instance setter and writes the real value.
    expect(el.value).toBe('hello')
    expect(instanceSetterCalls).toBe(0)
    expect(results[0].status).toBe('success')
  })
})

// A React-style custom dropdown: a trigger, a value display, and option divs.
// Clicking an option updates the display (mirrors how the real app behaves).
const customWidget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: ['#trigger'],
  valueDisplaySelectorCandidates: ['.val'],
  optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
  optionsOpenOnDemand: false,
}

function mountCustomSelect(selected = 'Locker') {
  document.body.innerHTML = `
    <div id="cat" data-test-id="cat" name="cat">
      <label for="catInput">Category</label>
      <div class="relative">
        <div role="button" data-trigger="select" id="trigger">
          <div class="select-value-container"><div class="val">${selected}</div><input id="catInput" type="text"></div>
        </div>
        <div class="dropdown">
          <div role="button" aria-label="Select option">Locker</div>
          <div role="button" aria-label="Select option">Office</div>
          <div role="button" aria-label="Select option">Parking</div>
        </div>
      </div>
    </div>`
  const val = document.querySelector('.val')!
  for (const opt of Array.from(document.querySelectorAll('.dropdown [role="button"]'))) {
    opt.addEventListener('click', () => {
      val.textContent = opt.textContent
    })
  }
}

function customInstruction(proposedValue: string): FillInstruction {
  return {
    detectedFieldId: 'cat',
    selectorCandidates: ['#cat'],
    frame: 'main',
    shadow: false,
    tagName: 'div',
    inputType: 'customSelect',
    fillStrategy: 'customSelect',
    proposedValue,
    customWidget,
  }
}

describe('applyFill — custom select', () => {
  it('clicks the matching option and verifies the displayed value', async () => {
    mountCustomSelect('Locker')
    const { results, undoSnapshot } = await applyFill([customInstruction('Office')])
    expect(document.querySelector('.val')!.textContent).toBe('Office')
    expect(results[0].status).toBe('success')
    expect(undoSnapshot.entries[0].previousDisplayText).toBe('Locker')
  })

  it('fails when no option matches the proposed value', async () => {
    mountCustomSelect('Locker')
    const { results } = await applyFill([customInstruction('Ghost')])
    expect(results[0].status).toBe('failed')
    expect(results[0].reason).toMatch(/no option matching/i)
  })

  it('matches options case- and whitespace-insensitively', async () => {
    mountCustomSelect('Locker')
    const { results } = await applyFill([customInstruction('  office ')])
    expect(document.querySelector('.val')!.textContent).toBe('Office')
    expect(results[0].status).toBe('success')
  })
})

// A searchable combobox (e.g. a React country picker): the value lives in a
// typeahead <input>, not a text node, and a placeholder <p> is shown until a
// pick is made. Selecting an option sets input.value and drops the placeholder.
const comboboxWidget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: ['#trigger'],
  valueDisplaySelectorCandidates: ['.select-value-container'],
  optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
  optionsOpenOnDemand: true,
}

function mountSearchableCombobox() {
  document.body.innerHTML = `
    <div id="country" data-test-id="country" name="address.country">
      <label for="countryInput">Country</label>
      <div class="relative">
        <div role="button" data-trigger="select" id="trigger">
          <div class="select-value-container">
            <p class="placeholder">i.e. United States</p>
            <input id="countryInput" type="text" autocomplete="off" />
          </div>
        </div>
        <div class="dropdown">
          <div role="button" aria-label="Select option">United States</div>
          <div role="button" aria-label="Select option">Canada</div>
          <div role="button" aria-label="Select option">Mexico</div>
        </div>
      </div>
    </div>`
  const container = document.querySelector('.select-value-container')!
  const input = document.getElementById('countryInput') as HTMLInputElement
  for (const opt of Array.from(document.querySelectorAll('.dropdown [role="button"]'))) {
    opt.addEventListener('mousedown', () => {
      input.value = opt.textContent ?? ''
      container.querySelector('p')?.remove()
    })
  }
}

function comboboxInstruction(proposedValue: string): FillInstruction {
  return {
    detectedFieldId: 'country',
    selectorCandidates: ['#country'],
    frame: 'main',
    shadow: false,
    tagName: 'div',
    inputType: 'customSelect',
    fillStrategy: 'customSelect',
    proposedValue,
    customWidget: comboboxWidget,
  }
}

describe('applyFill — searchable custom select (value in a typeahead input)', () => {
  // Regression: the picked value lands in the inner <input>, so verifying via
  // textContent read "" and false-failed a fill that actually succeeded.
  it('reports success when the selection lands in the typeahead input', async () => {
    mountSearchableCombobox()
    const { results } = await applyFill([comboboxInstruction('United States')])
    expect((document.getElementById('countryInput') as HTMLInputElement).value).toBe(
      'United States',
    )
    expect(results[0].status).toBe('success')
  })

  it('works for any option, not just the first', async () => {
    mountSearchableCombobox()
    const { results } = await applyFill([comboboxInstruction('Mexico')])
    expect((document.getElementById('countryInput') as HTMLInputElement).value).toBe('Mexico')
    expect(results[0].status).toBe('success')
  })
})

describe('element identity (no cross-field collision)', () => {
  // Regression: two fields that share a non-unique selector (e.g. autocomplete
  // token) must each fill THEIR OWN element. Previously both resolved to the
  // first match, so a later field's value overwrote an earlier field's element
  // while the real target stayed empty — e.g. the EIN value landed in DBA.
  it('resolves each field by its stamped data-qf-id marker, not a shared selector', async () => {
    document.body.innerHTML =
      '<input data-qf-id="qf-0" autocomplete="off" />' +
      '<input data-qf-id="qf-1" autocomplete="off" />'
    await applyFill([
      instruction({
        detectedFieldId: 'qf-0',
        selectorCandidates: ['input[autocomplete="off"]'],
        proposedValue: 'Liam Becker',
      }),
      instruction({
        detectedFieldId: 'qf-1',
        selectorCandidates: ['input[autocomplete="off"]'],
        proposedValue: '395',
      }),
    ])
    const inputs = document.querySelectorAll('input')
    expect((inputs[0] as HTMLInputElement).value).toBe('Liam Becker')
    expect((inputs[1] as HTMLInputElement).value).toBe('395')
  })

  it('never double-targets one element when markers are absent (claimed-set fallback)', async () => {
    // No data-qf-id stamps: both instructions fall back to the shared selector.
    // Claimed-tracking must route the second write to the second matching
    // element instead of overwriting the first.
    document.body.innerHTML = '<input autocomplete="off" /><input autocomplete="off" />'
    const { results } = await applyFill([
      instruction({
        detectedFieldId: 'a',
        selectorCandidates: ['input[autocomplete="off"]'],
        proposedValue: 'first',
      }),
      instruction({
        detectedFieldId: 'b',
        selectorCandidates: ['input[autocomplete="off"]'],
        proposedValue: 'second',
      }),
    ])
    const inputs = document.querySelectorAll('input')
    expect((inputs[0] as HTMLInputElement).value).toBe('first')
    expect((inputs[1] as HTMLInputElement).value).toBe('second')
    expect(results.map((r) => r.status)).toEqual(['success', 'success'])
  })
})

describe('applyFill — radio group', () => {
  function radioGroupInstruction(proposedValue: string): FillInstruction {
    return instruction({
      detectedFieldId: 'qf-0',
      tagName: 'input',
      inputType: 'radiogroup',
      fillStrategy: 'select',
      selectorCandidates: ['input[type="radio"][name="g"]'],
      proposedValue,
    })
  }

  it('selects the radio whose value matches and leaves the others unchecked', async () => {
    document.body.innerHTML = `
      <input type="radio" name="g" value="a" />
      <input type="radio" name="g" value="b" />
      <input type="radio" name="g" value="c" />`
    const { results } = await applyFill([radioGroupInstruction('b')])
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="g"]')
    expect(radios[0].checked).toBe(false)
    expect(radios[1].checked).toBe(true)
    expect(radios[2].checked).toBe(false)
    expect(results[0]).toMatchObject({ status: 'success', acceptedValue: 'b' })
  })

  it('matches by visible label when the value does not match', async () => {
    document.body.innerHTML = `
      <label><input type="radio" name="g" value="1" /> Yes</label>
      <label><input type="radio" name="g" value="0" /> No</label>`
    const { results } = await applyFill([radioGroupInstruction('No')])
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="g"]')
    expect(radios[1].checked).toBe(true)
    expect(results[0].status).toBe('success')
  })

  it('fails when no option in the group matches', async () => {
    document.body.innerHTML = `
      <input type="radio" name="g" value="a" />
      <input type="radio" name="g" value="b" />`
    const { results } = await applyFill([radioGroupInstruction('zzz')])
    expect(results[0].status).toBe('failed')
    expect(results[0].reason).toMatch(/no .*option|did not/i)
  })

  it('restores the previously-selected radio on undo', async () => {
    document.body.innerHTML = `
      <input type="radio" name="g" value="a" checked />
      <input type="radio" name="g" value="b" />`
    const { undoSnapshot } = await applyFill([radioGroupInstruction('b')])
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="g"]')
    expect(radios[1].checked).toBe(true)
    const undo = await applyUndo(undoSnapshot)
    expect(undo[0].status).toBe('success')
    expect(radios[0].checked).toBe(true)
    expect(radios[1].checked).toBe(false)
  })
})

describe('applyUndo', () => {
  it('restores previous input values and checkbox state', async () => {
    document.body.innerHTML = '<input id="name" value="Ada" /><input id="agree" type="checkbox" />'
    const { undoSnapshot } = await applyFill([
      instruction({ detectedFieldId: 'name', proposedValue: 'Grace' }),
      instruction({
        detectedFieldId: 'agree',
        inputType: 'checkbox',
        fillStrategy: 'clickToggle',
        proposedValue: 'true',
      }),
    ])
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Grace')
    expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(true)

    const results = await applyUndo(undoSnapshot)
    expect(results.every((r) => r.status === 'success')).toBe(true)
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Ada')
    expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(false)
  })

  it('restores a custom select to its previous selection', async () => {
    mountCustomSelect('Locker')
    const { undoSnapshot } = await applyFill([customInstruction('Parking')])
    expect(document.querySelector('.val')!.textContent).toBe('Parking')

    const results = await applyUndo(undoSnapshot)
    expect(results[0].status).toBe('success')
    expect(document.querySelector('.val')!.textContent).toBe('Locker')
  })
})
