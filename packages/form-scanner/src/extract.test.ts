import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getValidationAttrs, isVisible, type FormControl } from './extract'

/**
 * Simulate a real browser's layout for one element: a non-empty box means
 * "rendered", an empty box (no client rects) means "not rendered" (e.g. it sits
 * inside a display:none ancestor / an inactive tab panel). jsdom reports neither,
 * so these stubs let us exercise the geometry path that only runs in a real DOM.
 */
function stubBox(el: Element, box: { width: number; height: number } | null): void {
  const rects = box ? [{ ...box, top: 0, left: 0, right: box.width, bottom: box.height }] : []
  Object.defineProperty(el, 'getClientRects', {
    configurable: true,
    value: () => rects as unknown as DOMRectList,
  })
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      (box ? rects[0] : { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) as DOMRect,
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  // Drop the body layout stub so other suites keep jsdom's no-layout behavior.
  delete (document.body as { getBoundingClientRect?: unknown }).getBoundingClientRect
})

describe('isVisible — geometry hardening', () => {
  it('keeps a field that renders to a real box', () => {
    document.body.innerHTML = `<input id="visible" />`
    stubBox(document.body, { width: 800, height: 600 }) // layout is available
    const el = document.getElementById('visible')!
    stubBox(el, { width: 160, height: 32 })
    expect(isVisible(el)).toBe(true)
  })

  it('rejects a field that renders to no box (inside a display:none ancestor)', () => {
    document.body.innerHTML = `<div id="panel"><input id="hidden" /></div>`
    stubBox(document.body, { width: 800, height: 600 }) // layout is available
    const el = document.getElementById('hidden')!
    stubBox(el, null) // not rendered → no client rects
    expect(isVisible(el)).toBe(false)
  })

  it('keeps an sr-only control (tiny but rendered box)', () => {
    document.body.innerHTML = `<input id="sronly" class="sr-only" />`
    stubBox(document.body, { width: 800, height: 600 })
    const el = document.getElementById('sronly')!
    stubBox(el, { width: 1, height: 1 }) // sr-only: clipped to 1×1 but still laid out
    expect(isVisible(el)).toBe(true)
  })

  it('keeps a laid-out but zero-area element (mid-animation height:0 / scale(0))', () => {
    // An element animating from height:0, or under transform:scale(0), is still
    // laid out: it produces one client rect (of zero area). Only an element with
    // NO client rects (a display:none ancestor) is excluded — so a transient
    // zero-size field is not wrongly dropped during the scan.
    document.body.innerHTML = `<input id="anim" />`
    stubBox(document.body, { width: 800, height: 600 })
    stubBox(document.getElementById('anim')!, { width: 0, height: 0 }) // rendered, zero-area
    expect(isVisible(document.getElementById('anim')!)).toBe(true)
  })

  it('stays jsdom-safe: with no layout, geometry is not consulted', () => {
    // No body stub → body box is 0×0 (jsdom) → the geometry path must be skipped,
    // so an element with no client rects is still treated as visible.
    document.body.innerHTML = `<input id="x" />`
    expect(isVisible(document.getElementById('x')!)).toBe(true)
  })
})

describe('getValidationAttrs', () => {
  function input(html: string): FormControl {
    document.body.innerHTML = html
    return document.body.firstElementChild as FormControl
  }

  it('extracts pattern, min/maxLength (as ints) and raw min/max', () => {
    const el = input(
      `<input type="number" pattern="\\d+" minlength="2" maxlength="8" min="0" max="100" />`,
    )
    expect(getValidationAttrs(el)).toEqual({
      pattern: '\\d+',
      minLength: 2,
      maxLength: 8,
      min: '0',
      max: '100',
    })
  })

  it('keeps min/max raw for date inputs', () => {
    const el = input(`<input type="date" min="2020-01-01" max="2020-12-31" />`)
    expect(getValidationAttrs(el)).toEqual({ min: '2020-01-01', max: '2020-12-31' })
  })

  it('omits absent / blank / non-integer attributes', () => {
    const el = input(`<input type="text" minlength="" maxlength="abc" />`)
    expect(getValidationAttrs(el)).toEqual({})
  })
})
