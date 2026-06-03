import { beforeEach, describe, expect, it } from 'vitest'
import { scanForms } from './scan'

function setBody(html: string) {
  document.body.innerHTML = html
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('scanForms', () => {
  it('detects native fields and resolves labels', () => {
    setBody(`
      <h2>Contact</h2>
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" required value="a@b.com" />
      <label>Bio <textarea name="bio">hi</textarea></label>
      <label for="role">Role</label>
      <select id="role" name="role">
        <option value="admin">Admin</option>
        <option value="user" selected>User</option>
      </select>
      <input aria-label="Search" type="search" />
    `)

    const { fields } = scanForms(document)
    expect(fields).toHaveLength(4)

    const email = fields.find((f) => f.name === 'email')!
    expect(email.inputType).toBe('email')
    expect(email.labelText).toBe('Email address')
    expect(email.currentValue).toBe('a@b.com')
    expect(email.required).toBe(true)
    expect(email.autocomplete).toBe('email')
    expect(email.sectionHeading).toBe('Contact')
    expect(email.selectorCandidates).toContain('#email')
    expect(email.selectorCandidates).toContain('input[name="email"]')
    expect(email.domFingerprint).toMatch(/^[0-9a-f]{8}$/)

    const bio = fields.find((f) => f.name === 'bio')!
    expect(bio.inputType).toBe('textarea')
    expect(bio.labelText).toContain('Bio')

    const role = fields.find((f) => f.name === 'role')!
    expect(role.inputType).toBe('select')
    expect(role.options).toEqual([
      { value: 'admin', label: 'Admin', selected: false },
      { value: 'user', label: 'User', selected: true },
    ])

    const search = fields.find((f) => f.inputType === 'search')!
    expect(search.ariaLabel).toBe('Search')
  })

  it('stamps a stable data-qf-id marker on every detected element', () => {
    setBody(`
      <input id="a" />
      <input name="b" />
      <input autocomplete="off" />
    `)
    const { fields } = scanForms(document)
    expect(fields.length).toBeGreaterThan(0)
    for (const f of fields) {
      const marked = document.querySelector(`[data-qf-id="${f.id}"]`)
      expect(marked).not.toBeNull()
    }
  })

  it('clears stale markers from a previous scan before re-stamping', () => {
    setBody(`<input id="a" /><input id="b" />`)
    scanForms(document)
    // Drop one field from the DOM, then rescan: no orphaned data-qf-id may remain.
    document.getElementById('b')!.remove()
    scanForms(document)
    const marked = Array.from(document.querySelectorAll('[data-qf-id]'))
    expect(marked).toHaveLength(1)
  })

  it('does not use autocomplete as a selector candidate (non-unique token)', () => {
    setBody(`<input id="x" autocomplete="off" />`)
    const { fields } = scanForms(document)
    const x = fields[0]
    // autocomplete is still captured as matching metadata...
    expect(x.autocomplete).toBe('off')
    // ...but never as a selector — input[autocomplete="off"] matches many elements.
    expect(x.selectorCandidates.some((s) => s.includes('autocomplete'))).toBe(false)
  })

  it('excludes non-fillable (disabled/readonly) fields by default, keeps fillable ones', () => {
    setBody(`
      <input name="ok" />
      <input name="a" disabled />
      <input name="b" readonly />
    `)
    const { fields } = scanForms(document)
    // Disabled and read-only fields are not actionable — they never reach the UI.
    expect(fields.map((f) => f.name)).toEqual(['ok'])
  })

  it('keeps a readonly datepicker input (vue-datepicker) but still drops a plain readonly field', () => {
    setBody(`
      <div class="input--datepicker__wrapper relative">
        <label class="fw-700 flex items-center">Birthday</label>
        <div class="dp__main dp__theme_light" data-datepicker-instance data-test-id="subscriber_dob">
          <div class="dp__input_wrap">
            <div class="input--datepicker">
              <input class="input-primary fs-unmask" placeholder="MM/DD/YYYY" readonly value="" />
            </div>
          </div>
        </div>
      </div>
      <input name="total" readonly value="$0.00" />
    `)
    const { fields } = scanForms(document)
    // The datepicker's <input> is readonly only because you pick from the calendar —
    // it IS fillable (via the calendar), so it must survive the readonly skip and reach
    // the probe (which confirms it by actually opening a calendar).
    const birthday = fields.find((f) => f.labelText === 'Birthday')
    expect(birthday).toBeDefined()
    expect(birthday!.readonly).toBe(true)
    // A genuinely read-only display field (no date signal) stays excluded.
    expect(fields.some((f) => f.name === 'total')).toBe(false)
  })

  it('includes and flags disabled/readonly state on request', () => {
    setBody(`
      <input name="a" disabled />
      <input name="b" readonly />
    `)
    const { fields } = scanForms(document, { includeHidden: false, includeNonFillable: true })
    expect(fields.find((f) => f.name === 'a')!.disabled).toBe(true)
    expect(fields.find((f) => f.name === 'b')!.readonly).toBe(true)
  })

  it('excludes CSS-hidden fields by default and includes them on request', () => {
    setBody(`
      <input name="visible" />
      <input name="hiddenType" type="hidden" />
      <input name="noDisplay" style="display:none" />
    `)
    // type=hidden is never a fillable control, so it is dropped regardless.
    const def = scanForms(document)
    expect(def.fields.map((f) => f.name)).toEqual(['visible'])

    const all = scanForms(document, { includeHidden: true })
    expect(all.fields.map((f) => f.name).sort()).toEqual(['noDisplay', 'visible'])
    expect(all.fields.find((f) => f.name === 'noDisplay')!.visible).toBe(false)
  })

  it('groups same-name radios into a single enum field with options', () => {
    setBody(`
      <fieldset>
        <legend>Gender</legend>
        <label><input type="radio" name="gender" value="male" checked /> Male</label>
        <label><input type="radio" name="gender" value="female" /> Female</label>
        <label><input type="radio" name="gender" value="other" /> Other</label>
      </fieldset>
    `)
    const { fields } = scanForms(document)
    const group = fields.filter((f) => f.name === 'gender')
    expect(group).toHaveLength(1)
    const g = group[0]
    expect(g.inputType).toBe('radiogroup')
    expect(g.options?.map((o) => o.value)).toEqual(['male', 'female', 'other'])
    expect(g.options?.find((o) => o.value === 'male')?.selected).toBe(true)
    expect(g.currentValue).toBe('male')
    expect(g.labelText).toBe('Gender')
    expect(g.selectorCandidates).toContain('input[type="radio"][name="gender"]')
    // The group's identity must be stable (hashed over all option labels).
    expect(g.domFingerprint).toMatch(/^[0-9a-f]{8}$/)
  })

  it('keeps radios in different-named groups separate', () => {
    setBody(`
      <input type="radio" name="a" value="1" />
      <input type="radio" name="a" value="2" />
      <input type="radio" name="b" value="x" />
    `)
    const { fields } = scanForms(document)
    expect(
      fields
        .filter((f) => f.inputType === 'radiogroup')
        .map((f) => f.name)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('traverses open shadow DOM', () => {
    setBody('<div id="host"></div>')
    const host = document.getElementById('host')!
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<input name="inShadow" />'

    const { fields } = scanForms(document)
    const shadowField = fields.find((f) => f.name === 'inShadow')
    expect(shadowField).toBeDefined()
    expect(shadowField!.shadow).toBe(true)
  })

  it('produces a stable structure hash for the same form', () => {
    const html = '<input name="a" /><input name="b" />'
    setBody(html)
    const first = scanForms(document).structureHash
    setBody(html)
    const second = scanForms(document).structureHash
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{8}$/)
  })

  it('detects a custom (non-native) select as one field and folds its inner input', () => {
    setBody(`
      <div data-test-id="cat" name="globalUnitTypesId" class="relative">
        <label for="_r_17c_">Category</label>
        <div class="relative">
          <div role="button" data-trigger="select" aria-expanded="false">
            <div class="select-value-container"><div>Locker</div><input id="_r_17c_" type="text" /></div>
          </div>
          <div class="dropdown">
            <div role="button" aria-label="Select option">Locker</div>
            <div role="button" aria-label="Select option">Office</div>
            <div role="button" aria-label="Select option">Parking</div>
          </div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(1)
    const cat = fields[0]
    expect(cat.inputType).toBe('customSelect')
    expect(cat.labelText).toBe('Category')
    expect(cat.currentValue).toBe('Locker')
    expect(cat.options?.map((o) => o.label)).toEqual(['Locker', 'Office', 'Parking'])
    expect(cat.customWidget?.kind).toBe('select')
    expect(cat.customWidget?.optionItemSelector).toContain('role="option"')
    // The inner React-id input is folded into the widget, not emitted separately.
    expect(fields.some((f) => f.domId === '_r_17c_')).toBe(false)
  })

  it('detects a closed custom select whose options render on demand', () => {
    // Mirrors app.dev.quikstor.com: a data-trigger="select" combobox, collapsed,
    // with a placeholder and NO option nodes in the DOM until it is opened. The
    // human label ("Country") lives in an ancestor wrapper, not inside the widget,
    // and there is no inner <input> to link a `for=`.
    setBody(`
      <div class="input-container">
        <label>Country<span>*</span></label>
        <div class="relative">
          <div name="address.country" data-test-id="address-country" class="relative">
            <div class="relative">
              <div role="button" data-trigger="select" aria-expanded="false">
                <div class="select-value-container"><p>i.e. United States</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(1)
    const country = fields[0]
    expect(country.inputType).toBe('customSelect')
    expect(country.name).toBe('address.country')
    expect(country.labelText).toBe('Country')
    expect(country.options ?? []).toHaveLength(0)
    expect(country.customWidget?.kind).toBe('select')
  })

  it('does not treat a plain expandable button (no options) as a custom select', () => {
    // A disclosure/accordion toggle: role=button + aria-expanded but no select
    // signal and no option list. Must not be mistaken for a fillable dropdown.
    setBody(`
      <div>
        <div role="button" aria-expanded="false">Show advanced options</div>
        <div hidden>more content</div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(0)
  })

  it('captures search, portal, value-attr, and virtualization intel on a combobox', () => {
    setBody(`
      <div data-test-id="city" name="city" class="relative">
        <label>City</label>
        <div role="combobox" aria-controls="city-list" aria-expanded="true">
          <input id="q" type="text" />
        </div>
        <div id="city-list" role="listbox" class="rc-virtual-list-holder">
          <div role="option" data-value="par">Paris</div>
          <div role="option" data-value="ber">Berlin</div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    const w = fields[0].customWidget
    expect(w?.kind).toBe('select')
    expect(w?.isSearchable).toBe(true)
    expect(w?.searchInputSelector).toBe('#q')
    expect(w?.listboxId).toBe('city-list')
    expect(w?.optionValueAttr).toBe('data-value')
    expect(w?.isVirtualized).toBe(true)
  })

  it('classifies an aria-multiselectable widget as a multiselect', () => {
    setBody(`
      <div data-test-id="tags" name="tags">
        <label>Tags</label>
        <div role="combobox" aria-haspopup="listbox" aria-multiselectable="true" aria-expanded="true">
          <span>Choose</span>
        </div>
        <div role="listbox" aria-multiselectable="true">
          <div role="option">Red</div><div role="option">Green</div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields[0].customWidget?.kind).toBe('multiselect')
  })

  it('classifies a dialog/calendar opener as a datepicker', () => {
    setBody(`
      <div data-test-id="bday" name="bday">
        <label>Birthday</label>
        <div role="combobox" aria-haspopup="dialog" aria-expanded="false"><span>—</span></div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields[0].customWidget?.kind).toBe('datepicker')
  })

  it('does not treat a menu button (actions, not values) as a custom select', () => {
    setBody(`
      <div>
        <button aria-haspopup="menu" aria-expanded="false">Actions</button>
        <div role="menu"><div role="menuitem">Edit</div><div role="menuitem">Delete</div></div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(0)
  })

  it('heuristically detects an ARIA-less dropdown (placeholder + chevron + labelled field)', () => {
    // The "User Group(s)" multiselect from the user's app: a bare <button> with NO
    // role/aria/data-trigger — only placeholder text and a chevron in a labelled field.
    setBody(`
      <div class="flex flex-col" data-test-id="user-groups">
        <label>Select User Group(s)</label>
        <div class="relative flex items-center">
          <div class="group relative flex items-center">
            <button type="button">
              <p>Select User Groups</p>
              <span><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg></span>
            </button>
          </div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(1)
    expect(fields[0].inputType).toBe('customSelect')
    expect(fields[0].labelText).toBe('Select User Group(s)')
    expect(fields[0].customWidget?.kind).toBe('select')
  })

  it('does not heuristically swallow an adjunct picker beside a native input', () => {
    // A phone country-code <button> sits in the SAME labelled field as the phone
    // <input>. Treating the button as the field would suppress the input — so the
    // heuristic must decline (its field container holds a native control), leaving
    // only the phone input as a field.
    setBody(`
      <div data-test-id="phone-numbers-0" name="phoneNumbers.0">
        <label for="phone">Phone Number</label>
        <div class="group relative flex">
          <div class="w-[100px]">
            <button aria-label="Select country code" type="button">
              <span>+1</span><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
            </button>
          </div>
          <div class="flex-1"><input id="phone" type="tel" placeholder="(000) 000-0000" /></div>
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(1)
    expect(fields[0].inputType).toBe('tel')
    expect(fields[0].domId).toBe('phone')
  })

  it('does not heuristically detect an action button (no placeholder prompt)', () => {
    setBody(`
      <div class="field"><label>Name</label>
        <button type="button">Add New User <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg></button>
      </div>
    `)
    const { fields } = scanForms(document)
    expect(fields).toHaveLength(0)
  })

  it('drops junk framework-id-only fields but keeps labeled ones', () => {
    setBody(`
      <input id="_r_f4_" type="text" />
      <input id=":r9:" type="text" />
      <label for="real">Name</label>
      <input id="real" type="text" />
      <input id="_r_z_" name="keepme" type="text" />
    `)
    const { fields } = scanForms(document)
    const ids = fields.map((f) => f.domId)
    expect(ids).not.toContain('_r_f4_')
    expect(ids).not.toContain(':r9:')
    expect(ids).toContain('real') // real label → kept
    expect(ids).toContain('_r_z_') // generated id but usable name → kept
  })

  it('resolves a cousin <label> when it is neither linked nor wrapping', () => {
    // Mirrors app.stemlessco.xyz: label and input are siblings' cousins, the EIN
    // input has no name/id at all, and Address 1 has an opaque id="map".
    setBody(`
      <div class="col-span-6">
        <label class="flex items-center">EIN #<span>*</span>
          <span class="base-icon"><svg viewBox="0 0 24 24"></svg></span>
        </label>
        <div class="relative">
          <input data-maska="##-#######" placeholder="XX-XXXXXXX" type="text" />
          <div class="input-icon--wrapper"></div>
        </div>
      </div>
      <div class="col-span-6">
        <label>Address Line 1*</label>
        <div class="relative"><input type="text" id="map" placeholder="Start typing" /></div>
      </div>
    `)
    const { fields } = scanForms(document)
    const labels = fields.map((f) => f.labelText)
    expect(labels).toContain('EIN #')
    expect(labels).toContain('Address Line 1')
    // No field should fall through to an opaque auto id / dom id as its label.
    expect(fields.every((f) => f.labelText && !/^qf-\d+$/.test(f.labelText))).toBe(true)
  })

  it('does not borrow a label from a container that spans multiple fields', () => {
    setBody(`
      <div class="row">
        <label>Group Heading</label>
        <input name="x" />
        <input name="y" />
      </div>
    `)
    const { fields } = scanForms(document)
    // Two controls share the container, so neither may claim "Group Heading".
    expect(fields.find((f) => f.name === 'x')!.labelText).toBeUndefined()
    expect(fields.find((f) => f.name === 'y')!.labelText).toBeUndefined()
  })

  it('drops fields whose only identity is a generated token name', () => {
    setBody(`
      <input name="_r_42_" type="text" />
      <input name=":r3a:" type="text" />
      <input name="«r9»" type="text" />
      <label for="ok">Email</label>
      <input id="ok" name="_r_77_" type="text" />
      <input name="_r_88_" placeholder="Search the catalog" type="text" />
    `)
    const { fields } = scanForms(document)
    const names = fields.map((f) => f.name)
    expect(names).not.toContain('_r_42_') // generated-token name only → junk
    expect(names).not.toContain(':r3a:')
    expect(names).not.toContain('«r9»')
    expect(names).toContain('_r_77_') // generated name but real label → kept
    expect(names).toContain('_r_88_') // generated name but real placeholder → kept
  })

  it('flags a Google Places autocomplete input', () => {
    setBody(`
      <div class="col-span-6">
        <label>Address Line 1*</label>
        <div class="relative">
          <input id="map" class="input-primary w-full pac-target-input" type="text" placeholder="Start typing" />
        </div>
      </div>
    `)
    const { fields } = scanForms(document)
    const addr = fields.find((f) => f.domId === 'map')!
    expect(addr.autocompleteHint).toBe('googlePlaces')
    expect(addr.labelText).toBe('Address Line 1')
  })

  it('scopes the scan to a passed element root', () => {
    setBody(`
      <input name="outside" />
      <div id="dialog"><input name="inside1" /><input name="inside2" /></div>
    `)
    const dialog = document.getElementById('dialog')!
    const { fields } = scanForms(dialog)
    expect(fields.map((f) => f.name).sort()).toEqual(['inside1', 'inside2'])
  })

  it('resolves a label that lives outside the scoped element', () => {
    setBody(`
      <label for="scoped">Outside Label</label>
      <div id="dialog"><input id="scoped" name="scoped" /></div>
    `)
    const dialog = document.getElementById('dialog')!
    const { fields } = scanForms(dialog)
    expect(fields[0].labelText).toBe('Outside Label')
  })
})
