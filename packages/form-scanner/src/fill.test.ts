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
  isSearchable: false,
  isVirtualized: false,
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

describe('applyFill — custom select (value-matching)', () => {
  it('clicks the option whose visible text matches the proposed value', async () => {
    // Options carry an identical generic aria-label="Select option" (the user's app
    // pattern) — the real value is the text, so matching must key off textContent.
    mountCustomSelect('Parking')
    const { results, undoSnapshot } = await applyFill([customInstruction('Office')])
    expect(document.querySelector('.val')!.textContent).toBe('Office')
    expect(results[0].status).toBe('success')
    expect(results[0].acceptedValue).toBe('Office')
    expect(undoSnapshot.entries[0].previousDisplayText).toBe('Parking')
  })

  it('matches case-insensitively and ignores surrounding whitespace', async () => {
    mountCustomSelect('Parking')
    const { results } = await applyFill([customInstruction('  parking ')])
    expect(document.querySelector('.val')!.textContent).toBe('Parking')
    expect(results[0].status).toBe('success')
  })

  it('reports assisted (no selection committed) when no option matches', async () => {
    mountCustomSelect('Parking')
    const { results } = await applyFill([customInstruction('Penthouse')])
    // Nothing matched — no selection is committed; the display is unchanged and we
    // prompt the user to pick manually.
    expect(document.querySelector('.val')!.textContent).toBe('Parking')
    expect(results[0].status).toBe('assisted')
    expect(results[0].reason).toMatch(/couldn't find "Penthouse".*pick it manually/i)
  })

  it('closes the list on no match (re-presses the trigger) so it cannot dismiss a host modal', async () => {
    // Model an open-on-demand select: the option list is only in the DOM while open,
    // and the trigger toggles it. An open custom select we leave behind is its own
    // outside-dismiss layer that takes a surrounding modal down with it — so on a
    // no-match we must close it again. Without the fix the list stays in the DOM.
    mountCustomSelect('Parking')
    const relative = document.querySelector('.relative')!
    const dropdown = document.querySelector('.dropdown') as HTMLElement
    const trigger = document.getElementById('trigger')!
    dropdown.remove()
    let open = false
    trigger.addEventListener('click', () => {
      open = !open
      if (open) relative.appendChild(dropdown)
      else dropdown.remove()
    })
    const { results } = await applyFill([customInstruction('Penthouse')])
    expect(results[0].status).toBe('assisted')
    expect(document.querySelector('.dropdown')).toBeNull() // opened to search, then closed
  })

  it('opens custom-select dropdowns only after every plain field is written', async () => {
    // A plain input + a custom select, with the SELECT listed first. A custom
    // select's open list dismisses a hand-rolled modal when a later write moves
    // focus, so plain fields must be written before any list opens — regardless of
    // request order.
    mountCustomSelect('Locker')
    const name = document.createElement('input')
    name.id = 'name'
    document.body.appendChild(name)
    const order: string[] = []
    name.addEventListener('input', () => order.push('name'))
    document.getElementById('trigger')!.addEventListener('pointerdown', () => order.push('select'))
    await applyFill([
      customInstruction('Office'), // select first in the request…
      instruction({ detectedFieldId: 'name', selectorCandidates: ['#name'], proposedValue: 'Ada' }),
    ])
    expect(order).toEqual(['name', 'select']) // …but the plain field fills first
  })

  it('skips and leaves the widget untouched when no value was proposed', async () => {
    // Empty proposed value must NOT auto-pick: picking the first option silently
    // selected garbage (e.g. "United States" on a country list). Leave it alone.
    mountCustomSelect('Parking')
    const { results } = await applyFill([customInstruction('')])
    expect(document.querySelector('.val')!.textContent).toBe('Parking') // unchanged
    expect(results[0].status).toBe('skipped')
  })

  it('reports assisted when opened with a real value but the list has no options', async () => {
    document.body.innerHTML = `
      <div id="cat" data-test-id="cat" name="cat">
        <div role="button" data-trigger="select" id="trigger">
          <div class="val">—</div>
        </div>
      </div>`
    const { results } = await applyFill([customInstruction('Office')])
    expect(results[0].status).toBe('assisted')
  })
})

// Regression: a fill must never look like a press *outside* the drawer/dialog it
// is filling. clickElement used to emit coordinate-less MouseEvents, so every
// synthetic press reported clientX/clientY = 0 (the viewport's top-left corner)
// and pointerdown was not a real PointerEvent. Drag/dismiss drawer layers (Vaul,
// Radix, Reka) decide "press inside vs. outside" from event geometry + pointer
// identity, so a (0,0) press reads as outside and tears the drawer down mid-fill
// — even on the in-drawer trigger click that opens the dropdown.
describe('applyFill — custom select emits faithful, in-bounds pointer input', () => {
  function boxRect(left: number, top: number, width: number, height: number): DOMRect {
    const rect = {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }
    return { ...rect, toJSON: () => rect } as DOMRect
  }

  it('presses options as real PointerEvents at the element center, not (0,0)', async () => {
    mountCustomSelect('Parking')
    const option = document.querySelector('.dropdown [role="button"]') as HTMLElement
    option.getBoundingClientRect = () => boxRect(100, 200, 40, 20)
    let seen: PointerEvent | undefined
    option.addEventListener('pointerdown', (e) => {
      seen = e as PointerEvent
    })

    await applyFill([customInstruction('Locker')])

    expect(seen).toBeDefined()
    expect(seen).toBeInstanceOf(PointerEvent)
    expect(typeof seen!.pointerId).toBe('number')
    expect(seen!.clientX).toBe(120) // left 100 + width/2
    expect(seen!.clientY).toBe(210) // top 200 + height/2
    expect(seen!.bubbles).toBe(true)
  })

  it('keeps a drawer open whose outside-press dismiss is coordinate-based', async () => {
    mountCustomSelect('Parking')
    const panel = document.getElementById('cat')!
    const trigger = document.getElementById('trigger') as HTMLElement
    const option = document.querySelector('.dropdown [role="button"]') as HTMLElement
    // A tall on-screen drawer; its trigger and option sit comfortably inside it.
    panel.getBoundingClientRect = () => boxRect(50, 50, 500, 600)
    trigger.getBoundingClientRect = () => boxRect(100, 100, 200, 40)
    option.getBoundingClientRect = () => boxRect(100, 160, 200, 30)

    let drawerOpen = true
    const dismiss = (e: Event): void => {
      const p = e as PointerEvent
      const r = panel.getBoundingClientRect()
      const inside =
        p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom
      if (!inside) drawerOpen = false
    }
    document.addEventListener('pointerdown', dismiss, true)
    try {
      const { results } = await applyFill([customInstruction('Locker')])
      expect(drawerOpen).toBe(true)
      expect(results[0].status).toBe('success')
    } finally {
      document.removeEventListener('pointerdown', dismiss, true)
    }
  })
})

// Coordinate-based dismiss is guarded above; these cover the OTHER ways real
// drawers close — a document listener that checks event target/composedPath
// containment, and a focus-out handler. The country widget renders its options
// INSIDE the drawer, so a faithful fill must never trip either.
describe('applyFill — custom select does not trip non-coordinate drawer dismissals', () => {
  it('keeps a drawer open whose dismiss checks event target containment', async () => {
    mountCustomSelect('Parking')
    const drawer = document.getElementById('cat')! // options live INSIDE it
    let drawerOpen = true
    const dismiss = (e: Event): void => {
      const path = (e.composedPath?.() ?? [e.target]) as EventTarget[]
      if (!path.includes(drawer) && !drawer.contains(e.target as Node)) drawerOpen = false
    }
    const types = ['pointerdown', 'mousedown', 'click']
    for (const type of types) document.addEventListener(type, dismiss, true)
    try {
      const { results } = await applyFill([customInstruction('Office')])
      expect(drawerOpen).toBe(true)
      expect(results[0].status).toBe('success')
    } finally {
      for (const type of types) document.removeEventListener(type, dismiss, true)
    }
  })

  it('keeps a drawer open whose dismiss closes on focus leaving it', async () => {
    mountCustomSelect('Parking')
    const drawer = document.getElementById('cat')!
    let drawerOpen = true
    const onFocusOut = (e: FocusEvent): void => {
      const next = e.relatedTarget as Node | null
      if (next && !drawer.contains(next)) drawerOpen = false
    }
    document.addEventListener('focusout', onFocusOut as EventListener, true)
    try {
      const { results } = await applyFill([customInstruction('Office')])
      expect(drawerOpen).toBe(true)
      expect(results[0].status).toBe('success')
    } finally {
      document.removeEventListener('focusout', onFocusOut as EventListener, true)
    }
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
  isSearchable: false,
  isVirtualized: false,
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

  it('selects the matching option, not the first, when the value lands in the input', async () => {
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
    mountCustomSelect('Office')
    const { undoSnapshot } = await applyFill([customInstruction('Parking')])
    expect(document.querySelector('.val')!.textContent).toBe('Parking') // matched the value

    const results = await applyUndo(undoSnapshot)
    expect(results[0].status).toBe('success')
    expect(document.querySelector('.val')!.textContent).toBe('Office')
  })
})

// Scoping the fill to the drawer the scan resolved to is what stops a fill from
// reaching out and writing an element OUTSIDE the drawer (e.g. a focused navbar
// search), which trips a click-outside drawer's dismiss and tears it down. The
// scoped root must still find a custom-select option list that the widget portals
// to <body> (outside the drawer), or country/state selects would stop filling.
describe('applyFill — scoped to a root element', () => {
  it('confines a fuzzy-selector fill to the scoped root, never an outside twin', async () => {
    document.body.innerHTML = `
      <input name="city" value="OUTSIDE" />
      <section id="drawer"><input name="city" value="" /></section>`
    const drawer = document.getElementById('drawer')!
    await applyFill(
      [
        instruction({
          detectedFieldId: 'qf-0',
          selectorCandidates: ['input[name="city"]'], // fuzzy, no data-qf-id marker
          proposedValue: 'Los Angeles',
        }),
      ],
      drawer,
    )
    const all = Array.from(document.querySelectorAll('input[name="city"]')) as HTMLInputElement[]
    expect(all[0].value).toBe('OUTSIDE') // the element outside the drawer is untouched
    expect(drawer.querySelector('input')!.value).toBe('Los Angeles')
  })

  it('finds a custom-select option list portaled outside the scoped root', async () => {
    document.body.innerHTML = `
      <section id="drawer">
        <div id="country" data-test-id="country" name="country">
          <label for="ci">Country</label>
          <div role="button" data-trigger="select" id="trigger">
            <div class="select-value-container"><p class="ph">i.e. United States</p></div>
          </div>
        </div>
      </section>
      <div class="portal"></div>`
    const drawer = document.getElementById('drawer')!
    const portal = document.querySelector('.portal') as HTMLElement
    const trigger = document.getElementById('trigger') as HTMLElement
    // Opening the select renders its option list into a body-level portal, OUTSIDE
    // the drawer — the layout pattern Reka/Radix/MUI selects use.
    trigger.addEventListener('mousedown', () => {
      portal.innerHTML = `<div role="option">United States</div><div role="option">Canada</div>`
    })
    portal.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement
      if (t.getAttribute('role') === 'option') {
        ;(drawer.querySelector('.ph') as HTMLElement).textContent = t.textContent
      }
    })
    const widget: CustomWidget = {
      kind: 'select',
      triggerSelectorCandidates: ['#trigger'],
      valueDisplaySelectorCandidates: ['.select-value-container'],
      optionItemSelector: '[role="option"]',
      optionsOpenOnDemand: true,
      isSearchable: false,
      isVirtualized: false,
    }
    const { results } = await applyFill(
      [
        instruction({
          detectedFieldId: 'country',
          selectorCandidates: ['#country'],
          fillStrategy: 'customSelect',
          customWidget: widget,
          proposedValue: 'Canada',
        }),
      ],
      drawer,
    )
    expect(results[0].status).toBe('success')
    expect((drawer.querySelector('.ph') as HTMLElement).textContent).toBe('Canada')
  })

  it('keeps the drawer open when clicking an option portaled outside its bounds', async () => {
    const rect = (left: number, top: number, width: number, height: number): DOMRect => {
      const r = {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
      }
      return { ...r, toJSON: () => r } as DOMRect
    }
    document.body.innerHTML = `
      <section id="drawer">
        <div id="country" data-test-id="country" name="country">
          <div role="button" data-trigger="select" id="trigger">
            <div class="select-value-container"><p class="ph">i.e. United States</p></div>
          </div>
        </div>
      </section>
      <div class="portal"></div>`
    const drawer = document.getElementById('drawer') as HTMLElement
    const portal = document.querySelector('.portal') as HTMLElement
    const trigger = document.getElementById('trigger') as HTMLElement
    // Drawer occupies the left; its trigger sits inside it.
    drawer.getBoundingClientRect = () => rect(0, 0, 300, 600)
    trigger.getBoundingClientRect = () => rect(20, 100, 200, 40)
    // Opening portals the option to the FAR RIGHT — geometrically outside the drawer.
    trigger.addEventListener('mousedown', () => {
      portal.innerHTML = `<div role="option">United States</div>`
      const opt = portal.querySelector('[role="option"]') as HTMLElement
      opt.getBoundingClientRect = () => rect(600, 300, 160, 30)
      opt.addEventListener('mousedown', () => {
        ;(drawer.querySelector('.ph') as HTMLElement).textContent = 'United States'
      })
    })
    // A naive drawer that dismisses on any document press outside its panel rect.
    let drawerOpen = true
    const dismiss = (e: Event): void => {
      const p = e as PointerEvent
      const r = drawer.getBoundingClientRect()
      const inside =
        p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom
      if (!inside) drawerOpen = false
    }
    document.addEventListener('pointerdown', dismiss, true)
    try {
      const widget: CustomWidget = {
        kind: 'select',
        triggerSelectorCandidates: ['#trigger'],
        valueDisplaySelectorCandidates: ['.select-value-container'],
        optionItemSelector: '[role="option"]',
        optionsOpenOnDemand: true,
        isSearchable: false,
        isVirtualized: false,
      }
      const { results } = await applyFill(
        [
          instruction({
            detectedFieldId: 'country',
            selectorCandidates: ['#country'],
            fillStrategy: 'customSelect',
            customWidget: widget,
            proposedValue: 'United States',
          }),
        ],
        drawer,
      )
      expect(results[0].status).toBe('success')
      expect(drawerOpen).toBe(true) // the portaled option press read as INSIDE the drawer
    } finally {
      document.removeEventListener('pointerdown', dismiss, true)
    }
  })
})

// Options that carry stable automation attributes (data-test-id / data-value),
// the common E2E-instrumented app. Matching must prefer these — like a Playwright
// locator — so a proposed CODE resolves even when the visible text differs.
const attrWidget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: ['#trigger'],
  valueDisplaySelectorCandidates: ['.val'],
  optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
  optionsOpenOnDemand: false,
  isSearchable: false,
  isVirtualized: false,
}

function mountAttrSelect() {
  document.body.innerHTML = `
    <div id="cat" data-test-id="cat" name="cat">
      <div role="button" data-trigger="select" id="trigger"><div class="val">—</div></div>
      <div class="dropdown">
        <div role="option" data-value="US" data-test-id="cat-option-US">United States</div>
        <div role="option" data-value="CA" data-test-id="cat-option-CA">Canada</div>
        <div role="option" data-value="MX" data-test-id="cat-option-MX">Mexico</div>
      </div>
    </div>`
  const val = document.querySelector('.val')!
  for (const opt of Array.from(document.querySelectorAll('.dropdown [role="option"]'))) {
    opt.addEventListener('click', () => {
      val.textContent = opt.textContent
    })
  }
}

function attrInstruction(proposedValue: string): FillInstruction {
  return {
    detectedFieldId: 'cat',
    selectorCandidates: ['#cat'],
    frame: 'main',
    shadow: false,
    tagName: 'div',
    inputType: 'customSelect',
    fillStrategy: 'customSelect',
    proposedValue,
    customWidget: attrWidget,
  }
}

describe('applyFill — custom select (automation-attribute matching)', () => {
  it('matches a proposed code against data-value', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('CA')])
    expect(document.querySelector('.val')!.textContent).toBe('Canada')
    expect(results[0].status).toBe('success')
  })

  it('matches the trailing segment of a data-test-id', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('MX')])
    expect(document.querySelector('.val')!.textContent).toBe('Mexico')
    expect(results[0].status).toBe('success')
  })

  it('still matches the human label by text when the code is not used', async () => {
    mountAttrSelect()
    const { results } = await applyFill([attrInstruction('United States')])
    expect(document.querySelector('.val')!.textContent).toBe('United States')
    expect(results[0].status).toBe('success')
  })
})

describe('applyFill — custom select (finds role-less automation-attribute options)', () => {
  it('locates options that have only a namespaced data-test-id', async () => {
    document.body.innerHTML = `
      <div id="cat" data-test-id="cat" name="cat">
        <div role="button" data-trigger="select" id="trigger"><div class="val">—</div></div>
        <div class="dropdown">
          <div data-test-id="cat-option-locker">Locker</div>
          <div data-test-id="cat-option-office">Office</div>
        </div>
      </div>`
    const val = document.querySelector('.val')!
    for (const opt of Array.from(document.querySelectorAll('.dropdown [data-test-id]'))) {
      opt.addEventListener('click', () => {
        val.textContent = opt.textContent
      })
    }
    const widget: CustomWidget = {
      kind: 'select',
      triggerSelectorCandidates: ['#trigger'],
      valueDisplaySelectorCandidates: ['.val'],
      optionItemSelector: '[role="option"], [role="button"][aria-label*="option" i]',
      optionsOpenOnDemand: false,
      isSearchable: false,
      isVirtualized: false,
    }
    const { results } = await applyFill([
      {
        detectedFieldId: 'cat',
        selectorCandidates: ['#cat'],
        frame: 'main',
        shadow: false,
        tagName: 'div',
        inputType: 'customSelect',
        fillStrategy: 'customSelect',
        proposedValue: 'Office',
        customWidget: widget,
      },
    ])
    expect(document.querySelector('.val')!.textContent).toBe('Office')
    expect(results[0].status).toBe('success')
  })
})

// Universal value-matching across the ARIA/library patterns the engine must handle
// without per-framework code: portaled listboxes, label-vs-value, typeahead filter,
// keyboard-only commit, multi-select, and calendar navigation.
describe('applyFill — custom select across framework patterns', () => {
  function widgetOf(extra: Partial<CustomWidget>): CustomWidget {
    return {
      kind: 'select',
      triggerSelectorCandidates: ['#t'],
      valueDisplaySelectorCandidates: ['.d'],
      optionItemSelector: '[role="option"]',
      optionsOpenOnDemand: true,
      isSearchable: false,
      isVirtualized: false,
      ...extra,
    }
  }
  function ins(value: string, widget: CustomWidget): FillInstruction {
    return {
      detectedFieldId: 'w',
      selectorCandidates: ['#w'],
      frame: 'main',
      shadow: false,
      tagName: 'div',
      inputType: 'customSelect',
      fillStrategy: 'customSelect',
      proposedValue: value,
      customWidget: widget,
    }
  }
  /** Wire each [role=option] so a click sets the display and marks it selected. */
  function wireOptions(display: Element, scope: ParentNode = document): void {
    for (const opt of Array.from(scope.querySelectorAll('[role="option"]'))) {
      opt.addEventListener('mousedown', () => {
        display.textContent = opt.textContent
        opt.setAttribute('aria-selected', 'true')
      })
    }
  }

  it('resolves a portaled listbox via aria-controls and selects the matching option (MUI/Radix)', async () => {
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="fruit">
        <div role="combobox" id="t" aria-controls="lb" aria-expanded="false"><span class="d">Pick</span></div>
      </div>
      <div id="lb" role="listbox" hidden>
        <div role="option" id="o1">Alpha</div>
        <div role="option" id="o2">Beta</div>
        <div role="option" id="o3">Gamma</div>
      </div>`
    const lb = document.getElementById('lb')!
    document.getElementById('t')!.addEventListener('mousedown', () => lb.removeAttribute('hidden'))
    wireOptions(document.querySelector('.d')!)
    const { results } = await applyFill([ins('Beta', widgetOf({ listboxId: 'lb' }))])
    expect(document.querySelector('.d')!.textContent).toBe('Beta')
    expect(results[0].status).toBe('success')
  })

  it('matches by visible label and by the option value attribute (label-vs-value)', async () => {
    function mount(): void {
      document.body.innerHTML = `
        <div id="w" data-test-id="w" name="country">
          <div role="combobox" id="t"><span class="d">—</span></div>
          <div role="listbox">
            <div role="option" data-value="us">United States</div>
            <div role="option" data-value="ca">Canada</div>
          </div>
        </div>`
      wireOptions(document.querySelector('.d')!)
    }
    const widget = widgetOf({
      optionItemSelector: '[role="option"]',
      optionValueAttr: 'data-value',
    })
    mount()
    await applyFill([ins('united states', widget)]) // normalized label
    expect(document.querySelector('.d')!.textContent).toBe('United States')
    mount()
    await applyFill([ins('ca', widget)]) // stored code via data-value
    expect(document.querySelector('.d')!.textContent).toBe('Canada')
  })

  it('types into the search input to surface a filtered option, then selects it', async () => {
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="city">
        <div role="combobox" id="t"><span class="d">—</span><input id="q" type="text" /></div>
        <div class="list" role="listbox"></div>
      </div>`
    const list = document.querySelector('.list')!
    const display = document.querySelector('.d')!
    const q = document.getElementById('q') as HTMLInputElement
    const DATA = ['Paris', 'Berlin', 'Madrid']
    q.addEventListener('input', () => {
      const term = q.value.toLowerCase()
      list.innerHTML = ''
      for (const city of DATA.filter((c) => c.toLowerCase().includes(term))) {
        const o = document.createElement('div')
        o.setAttribute('role', 'option')
        o.textContent = city
        o.addEventListener('mousedown', () => {
          display.textContent = city
        })
        list.appendChild(o)
      }
    })
    const widget = widgetOf({ searchInputSelector: '#q', isSearchable: true })
    const { results } = await applyFill([ins('Madrid', widget)])
    expect(display.textContent).toBe('Madrid')
    expect(results[0].status).toBe('success')
  })

  it('falls back to keyboard navigation when clicking the option does not commit', async () => {
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="opt">
        <div role="combobox" id="t" aria-activedescendant=""><span class="d">—</span></div>
        <div role="listbox">
          <div role="option" id="k1">One</div>
          <div role="option" id="k2">Two</div>
          <div role="option" id="k3">Three</div>
        </div>
      </div>`
    const t = document.getElementById('t')!
    const display = document.querySelector('.d')!
    const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[]
    // Clicks are inert here — only the keyboard path commits (roving/activedescendant widget).
    let active = -1
    t.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key
      if (key === 'ArrowDown') {
        active = Math.min(active + 1, opts.length - 1)
        t.setAttribute('aria-activedescendant', opts[active].id)
      } else if (key === 'Enter' && active >= 0) {
        display.textContent = opts[active].textContent
      }
    })
    const { results } = await applyFill([ins('Three', widgetOf({ optionsOpenOnDemand: false }))])
    expect(display.textContent).toBe('Three')
    expect(results[0].status).toBe('success')
  })

  it('selects multiple values in a multi-select, one click each', async () => {
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="tags">
        <div role="combobox" id="t" aria-multiselectable="true"><span class="d"></span></div>
        <div role="listbox" aria-multiselectable="true">
          <div role="option" id="m1">Red</div>
          <div role="option" id="m2">Green</div>
          <div role="option" id="m3">Blue</div>
        </div>
      </div>`
    const display = document.querySelector('.d')!
    for (const opt of Array.from(document.querySelectorAll('[role="option"]'))) {
      opt.addEventListener('mousedown', () => {
        opt.setAttribute('aria-selected', 'true')
        display.textContent = display.textContent
          ? `${display.textContent}, ${opt.textContent}`
          : opt.textContent
      })
    }
    const { results } = await applyFill([ins('Red, Blue', widgetOf({ kind: 'multiselect' }))])
    expect(display.textContent).toBe('Red, Blue')
    expect(results[0].status).toBe('success')
  })

  it('value-matches an ARIA-less <li>+checkbox multiselect, detecting multi from the open list', async () => {
    // The user's "User Group(s)" widget: a bare button opens an inline panel whose
    // options are <li> rows — each a <label> (the value) + a hidden readonly checkbox
    // toggled by a click handler on the row. No role=option, no aria, no chips.
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="userGroups">
        <label>Select User Group(s)</label>
        <div class="relative flex items-center">
          <div class="group">
            <button type="button" id="t"><p>Select User Groups</p>
              <span><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg></span>
            </button>
          </div>
          <div class="panel" hidden><ul data-test-id="list"></ul></div>
        </div>
      </div>`
    const panel = document.querySelector('.panel') as HTMLElement
    const ul = document.querySelector('ul')!
    const GROUPS = ['asd', 'District Manipulator', 'Impulse Storage Users', 'Create Group']
    const renderList = (): void => {
      ul.innerHTML = ''
      for (const g of GROUPS) {
        const li = document.createElement('li')
        const row = document.createElement('div')
        row.className = 'p-2 cursor-pointer'
        const label = document.createElement('label')
        label.textContent = g
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.readOnly = true
        row.append(label, cb)
        li.appendChild(row)
        row.addEventListener('click', () => {
          cb.checked = !cb.checked // app handler; readonly box driven by JS
        })
        ul.appendChild(li)
      }
    }
    document.getElementById('t')!.addEventListener('click', () => {
      panel.removeAttribute('hidden')
      renderList()
    })
    const widget = widgetOf({ optionItemSelector: '[role="option"]' }) // closed scan saw no options
    const { results } = await applyFill([
      ins('District Manipulator, Impulse Storage Users', widget),
    ])
    const checked = (name: string): boolean =>
      Array.from(document.querySelectorAll('li')).some(
        (li) =>
          li.querySelector('label')!.textContent === name && li.querySelector('input')!.checked,
      )
    expect(checked('District Manipulator')).toBe(true)
    expect(checked('Impulse Storage Users')).toBe(true)
    expect(checked('asd')).toBe(false)
    expect(results[0].status).toBe('success')
  })

  it('navigates a calendar to the target month and clicks the day cell (datepicker)', async () => {
    document.body.innerHTML = `
      <div id="w" data-test-id="w" name="bday">
        <div role="button" id="t" aria-haspopup="dialog"><span class="d">—</span></div>
      </div>
      <div class="cal" hidden>
        <div class="cal-header"><span class="cal-title"></span>
          <button class="prev" aria-label="Previous month"></button>
          <button class="next" aria-label="Next month"></button>
        </div>
        <div role="grid" class="grid"></div>
      </div>`
    const MONTHS = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    const cal = document.querySelector('.cal') as HTMLElement
    const title = document.querySelector('.cal-title')!
    const grid = document.querySelector('.grid')!
    const display = document.querySelector('.d')!
    const cur = { y: 2026, m: 4 } // May 2026
    const render = (): void => {
      title.textContent = `${MONTHS[cur.m]} ${cur.y}`
      grid.innerHTML = ''
      for (let day = 1; day <= 28; day++) {
        const cell = document.createElement('div')
        cell.setAttribute('role', 'gridcell')
        cell.setAttribute('aria-label', `${MONTHS[cur.m]} ${day}, ${cur.y}`)
        cell.textContent = String(day)
        cell.addEventListener('mousedown', () => {
          display.textContent = cell.getAttribute('aria-label')
        })
        grid.appendChild(cell)
      }
    }
    document.getElementById('t')!.addEventListener('mousedown', () => {
      cal.removeAttribute('hidden')
      render()
    })
    document.querySelector('.next')!.addEventListener('mousedown', () => {
      cur.m = (cur.m + 1) % 12
      if (cur.m === 0) cur.y++
      render()
    })
    document.querySelector('.prev')!.addEventListener('mousedown', () => {
      cur.m = (cur.m + 11) % 12
      if (cur.m === 11) cur.y--
      render()
    })
    const { results } = await applyFill([ins('2026-07-15', widgetOf({ kind: 'datepicker' }))])
    expect(display.textContent).toBe('July 15, 2026')
    expect(results[0].status).toBe('success')
  })
})
