import { describe, expect, it } from 'vitest'
import { isOccludingHit, MIN_FILLABLE_FIELDS, qualifiesForFill } from './placement'

describe('qualifiesForFill', () => {
  it('rejects forms with fewer than 2 fillable fields', () => {
    expect(qualifiesForFill(0)).toBe(false)
    expect(qualifiesForFill(1)).toBe(false)
  })

  it('accepts forms with 2 or more fillable fields', () => {
    expect(qualifiesForFill(2)).toBe(true)
    expect(qualifiesForFill(3)).toBe(true)
    expect(qualifiesForFill(4)).toBe(true)
    expect(qualifiesForFill(MIN_FILLABLE_FIELDS)).toBe(true)
  })
})

describe('isOccludingHit', () => {
  // anchor lives inside `root`; `host` is our overlay subtree; `drawer` is a foreign
  // element that could cover the anchor. `contains` works on detached trees, so no
  // need to attach to document.
  function fixture() {
    const root = document.createElement('div')
    const host = document.createElement('div')
    const hostChild = document.createElement('i')
    host.appendChild(hostChild)
    const anchor = document.createElement('button')
    const anchorChild = document.createElement('span')
    anchor.appendChild(anchorChild)
    const drawer = document.createElement('div')
    root.append(host, anchor, drawer)
    return { root, host, hostChild, anchor, anchorChild, drawer }
  }

  it('not occluded when the hit IS the anchor', () => {
    const { anchor, host } = fixture()
    expect(isOccludingHit(anchor, host, anchor)).toBe(false)
  })

  it('not occluded when the hit is inside the anchor', () => {
    const { anchor, anchorChild, host } = fixture()
    expect(isOccludingHit(anchor, host, anchorChild)).toBe(false)
  })

  it('not occluded when the hit is an ancestor of the anchor', () => {
    const { anchor, root, host } = fixture()
    expect(isOccludingHit(anchor, host, root)).toBe(false)
  })

  it('not occluded when the hit is inside the ignored host', () => {
    const { anchor, host, hostChild } = fixture()
    expect(isOccludingHit(anchor, host, hostChild)).toBe(false)
  })

  it('occluded when a foreign element covers the anchor', () => {
    const { anchor, host, drawer } = fixture()
    expect(isOccludingHit(anchor, host, drawer)).toBe(true)
  })

  it('occluded when nothing is hit (anchor off-screen)', () => {
    const { anchor, host } = fixture()
    expect(isOccludingHit(anchor, host, null)).toBe(true)
  })
})
