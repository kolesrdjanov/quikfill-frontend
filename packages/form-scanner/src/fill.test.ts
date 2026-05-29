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
