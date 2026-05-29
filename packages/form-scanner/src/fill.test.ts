import { beforeEach, describe, expect, it } from 'vitest'
import type { FillInstruction } from '@quikfill/schemas'
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
  it('fills a native input and verifies the value', () => {
    document.body.innerHTML = '<input id="email" value="old" />'
    const { results, undoSnapshot } = applyFill([
      instruction({ detectedFieldId: 'email', proposedValue: 'new@x.com' }),
    ])
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('new@x.com')
    expect(results[0]).toMatchObject({ status: 'success', acceptedValue: 'new@x.com' })
    expect(undoSnapshot.entries[0].previousValue).toBe('old')
  })

  it('dispatches input/change events', () => {
    document.body.innerHTML = '<input id="a" />'
    const seen: string[] = []
    const el = document.getElementById('a')!
    el.addEventListener('input', () => seen.push('input'))
    el.addEventListener('change', () => seen.push('change'))
    applyFill([instruction({ detectedFieldId: 'a', proposedValue: 'x' })])
    expect(seen).toContain('input')
    expect(seen).toContain('change')
  })

  it('toggles a checkbox', () => {
    document.body.innerHTML = '<input id="agree" type="checkbox" />'
    applyFill([
      instruction({
        detectedFieldId: 'agree',
        inputType: 'checkbox',
        fillStrategy: 'clickToggle',
        proposedValue: 'true',
      }),
    ])
    expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(true)
  })

  it('sets a native select to a valid option', () => {
    document.body.innerHTML =
      '<select id="role"><option value="admin">A</option><option value="user">U</option></select>'
    const { results } = applyFill([
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

  it('fails when a value is not accepted (invalid select option)', () => {
    document.body.innerHTML = '<select id="role"><option value="admin">A</option></select>'
    const { results } = applyFill([
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

  it('skips missing, disabled, and read-only fields', () => {
    document.body.innerHTML = '<input id="ro" readonly /><input id="dis" disabled />'
    const { results } = applyFill([
      instruction({ detectedFieldId: 'missing', proposedValue: 'x' }),
      instruction({ detectedFieldId: 'ro', proposedValue: 'x' }),
      instruction({ detectedFieldId: 'dis', proposedValue: 'x' }),
    ])
    expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(results[0].reason).toMatch(/not found/i)
    expect(results[1].reason).toMatch(/read-only/i)
    expect(results[2].reason).toMatch(/disabled/i)
  })

  it('writes through a framework-controlled value setter', () => {
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
    const { results } = applyFill([
      instruction({ detectedFieldId: 'react', proposedValue: 'hello' }),
    ])
    // The prototype setter bypasses the instance setter and writes the real value.
    expect(el.value).toBe('hello')
    expect(instanceSetterCalls).toBe(0)
    expect(results[0].status).toBe('success')
  })
})

describe('applyUndo', () => {
  it('restores previous input values and checkbox state', () => {
    document.body.innerHTML = '<input id="name" value="Ada" /><input id="agree" type="checkbox" />'
    const { undoSnapshot } = applyFill([
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

    const results = applyUndo(undoSnapshot)
    expect(results.every((r) => r.status === 'success')).toBe(true)
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Ada')
    expect((document.getElementById('agree') as HTMLInputElement).checked).toBe(false)
  })
})
