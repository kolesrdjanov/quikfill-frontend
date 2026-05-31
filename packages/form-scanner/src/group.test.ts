import { beforeEach, describe, expect, it } from 'vitest'
import { findSubmitButton, scanFormsGrouped } from './group'

function setBody(html: string) {
  document.body.innerHTML = html
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('scanFormsGrouped', () => {
  it('groups fields by their owning <form> and detects the submit button', () => {
    setBody(`
      <form id="signin">
        <label for="e">Email</label>
        <input id="e" name="email" type="email" />
        <label for="p">Password</label>
        <input id="p" name="password" type="password" />
        <button type="submit">Sign in</button>
      </form>
      <form id="newsletter">
        <input name="subscriber" type="email" />
        <button type="submit">Subscribe</button>
      </form>
    `)

    const { fields, forms } = scanFormsGrouped(document)
    expect(forms).toHaveLength(2)

    const signin = forms.find((f) => f.formId === 'signin')!
    expect(signin.fieldIds).toHaveLength(2)
    expect(signin.submitSelectorCandidates.length).toBeGreaterThan(0)
    expect(signin.label).toBe('Sign in')

    const newsletter = forms.find((f) => f.formId === 'newsletter')!
    expect(newsletter.fieldIds).toHaveLength(1)

    // every grouped field id is a real detected field
    const ids = new Set(fields.map((f) => f.id))
    for (const form of forms) for (const id of form.fieldIds) expect(ids.has(id)).toBe(true)
  })

  it('groups a formless React form by the ancestor holding its submit button', () => {
    setBody(`
      <div class="card">
        <input name="first" type="text" />
        <input name="last" type="text" />
        <div class="actions"><button>Continue</button></div>
      </div>
    `)

    const { forms } = scanFormsGrouped(document)
    expect(forms).toHaveLength(1)
    expect(forms[0].fieldIds).toHaveLength(2)
    // the synthetic group root is stamped so it can be re-resolved
    expect(forms[0].formId).toMatch(/^qf-form-\d+$/)
    const stamped = document.querySelector(`[data-qf-form="${forms[0].formId}"]`)
    expect(stamped).not.toBeNull()
    expect(forms[0].submitSelectorCandidates.length).toBeGreaterThan(0)
  })

  it('keeps two distinct formless forms apart by their nearest submit ancestor', () => {
    setBody(`
      <section class="login">
        <input name="user" />
        <button>Log in</button>
      </section>
      <section class="signup">
        <input name="newuser" />
        <button>Create account</button>
      </section>
    `)

    const { forms } = scanFormsGrouped(document)
    expect(forms).toHaveLength(2)
    expect(forms.every((f) => f.fieldIds.length === 1)).toBe(true)
  })

  it('finds a nested submit button inside a real form', () => {
    setBody(`
      <form id="deep">
        <input name="x" />
        <footer><div class="row"><button type="submit">Save</button></div></footer>
      </form>
    `)
    const { forms } = scanFormsGrouped(document)
    expect(forms[0].submitSelectorCandidates.length).toBeGreaterThan(0)
    expect(forms[0].label).toBe('Save')
  })

  it('still groups a form with no submit button (empty submit candidates)', () => {
    setBody(`
      <form id="nosubmit">
        <input name="q" type="search" />
      </form>
    `)
    const { forms } = scanFormsGrouped(document)
    expect(forms).toHaveLength(1)
    expect(forms[0].submitSelectorCandidates).toEqual([])
  })

  it('clears stale data-qf-form markers between scans', () => {
    setBody(`<div><input name="a" /><button>Submit</button></div>`)
    scanFormsGrouped(document)
    const firstCount = document.querySelectorAll('[data-qf-form]').length
    expect(firstCount).toBe(1)
    // re-scan: no duplicate/stale markers accumulate
    scanFormsGrouped(document)
    expect(document.querySelectorAll('[data-qf-form]').length).toBe(1)
  })
})

describe('findSubmitButton', () => {
  it('prefers an explicit type=submit over a text match', () => {
    setBody(`
      <form>
        <button>Cancel</button>
        <button type="submit">OK</button>
      </form>
    `)
    const form = document.querySelector('form')!
    expect(findSubmitButton(form)?.textContent).toBe('OK')
  })

  it('falls back to a trailing submit-intent button when no type=submit', () => {
    setBody(`
      <div>
        <button>Reset</button>
        <button>Apply changes</button>
      </div>
    `)
    const div = document.querySelector('div')!
    expect(findSubmitButton(div)?.textContent).toBe('Apply changes')
  })

  it('picks the trailing non-dismiss action over a Cancel — no verb list needed', () => {
    // "Add Facility" is in no positive vocabulary; it is chosen because it is the
    // last button that is not an obvious dismiss.
    setBody(`
      <div>
        <button>Cancel</button>
        <button>Add Facility</button>
      </div>
    `)
    const div = document.querySelector('div')!
    expect(findSubmitButton(div)?.textContent).toBe('Add Facility')
  })

  it('skips an icon close button (aria-label) and picks the trailing action', () => {
    setBody(`
      <div>
        <button aria-label="Close">✕</button>
        <input name="x" />
        <button>Wizardly Proceed-o-tron</button>
      </div>
    `)
    const div = document.querySelector('div')!
    expect(findSubmitButton(div)?.textContent).toBe('Wizardly Proceed-o-tron')
  })

  it('treats a no-type <button> inside a <form> as the submit (HTML spec)', () => {
    setBody(`
      <form id="np">
        <input name="x" />
        <button>Whatever Label</button>
      </form>
    `)
    expect(findSubmitButton(document.querySelector('form')!)?.textContent).toBe('Whatever Label')
  })

  it('returns null when no button reads as submit-intent', () => {
    setBody(`<div><button>Reset</button><button>Cancel</button></div>`)
    const div = document.querySelector('div')!
    expect(findSubmitButton(div)).toBeNull()
  })
})
