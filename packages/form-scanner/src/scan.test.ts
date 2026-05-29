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

  it('flags disabled and readonly state', () => {
    setBody(`
      <input name="a" disabled />
      <input name="b" readonly />
    `)
    const { fields } = scanForms(document)
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
})
