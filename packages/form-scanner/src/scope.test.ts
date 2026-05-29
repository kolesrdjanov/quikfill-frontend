import { beforeEach, describe, expect, it } from 'vitest'
import { resolveScopeRoot } from './scope'

function setBody(html: string) {
  document.body.innerHTML = html
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('resolveScopeRoot', () => {
  it('auto-picks an open dialog over page chrome', () => {
    setBody(`
      <nav><input type="search" name="search" /></nav>
      <div role="dialog" aria-modal="true">
        <h2>Add Unit</h2>
        <form><input name="unit" /><input name="rate" /></form>
      </div>
    `)
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('dialog')
    expect(scope.label).toBe('Add Unit dialog')
    expect((scope.root as Element).getAttribute('role')).toBe('dialog')
  })

  it('treats a div drawer (no form) as the scope', () => {
    setBody(`
      <input name="pageLevel" />
      <div role="dialog" aria-modal="true"><h3>Add Prospect</h3><input name="first" /></div>
    `)
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('dialog')
    expect(scope.root).not.toBe(document)
  })

  it('falls back to the focused form when no dialog exists', () => {
    setBody(`
      <form id="a"><input id="afield" name="a1" /></form>
      <form id="b"><input name="b1" /><input name="b2" /></form>
    `)
    document.getElementById('afield')!.focus()
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('form')
    expect((scope.root as Element).id).toBe('a')
  })

  it('picks the largest form when nothing is focused', () => {
    setBody(`
      <form id="a"><input name="a1" /></form>
      <form id="b"><input name="b1" /><input name="b2" /></form>
    `)
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('form')
    expect((scope.root as Element).id).toBe('b')
  })

  it('falls back to the whole page when no form or dialog exists', () => {
    setBody('<input name="loose" />')
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('page')
    expect(scope.root).toBe(document)
  })

  it('prefers the innermost of stacked dialogs', () => {
    setBody(`
      <div role="dialog" aria-modal="true">
        <input name="outer" />
        <div role="dialog" aria-modal="true"><h2>Confirm</h2><input name="inner" /></div>
      </div>
    `)
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('dialog')
    expect(scope.label).toBe('Confirm dialog')
  })

  it('ignores a hidden/closed dialog and uses the form instead', () => {
    setBody(`
      <div role="dialog" aria-modal="true" style="display:none"><input name="ghost" /></div>
      <form><input name="real" /></form>
    `)
    const scope = resolveScopeRoot(document, 'auto')
    expect(scope.kind).toBe('form')
  })

  it("honors an explicit 'page' scope", () => {
    setBody('<div role="dialog" aria-modal="true"><input name="x" /></div>')
    const scope = resolveScopeRoot(document, 'page')
    expect(scope.kind).toBe('page')
    expect(scope.root).toBe(document)
  })
})
