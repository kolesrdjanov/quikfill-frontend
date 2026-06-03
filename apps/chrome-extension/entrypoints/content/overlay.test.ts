import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The overlay's only chrome-touching dependency is `@quikfill/browser-adapter`;
// stub it so the content script mounts under jsdom without a real extension
// context. Everything else (form-scanner, ai, overlay-gate, schemas) is pure
// DOM/logic and runs for real, so a genuine `<form>` is detected and earns a button.
vi.mock('@quikfill/browser-adapter', () => ({
  requestEntitlements: vi.fn(async () => null),
  refreshEntitlements: vi.fn(async () => null),
  // Imported inside the call (not the factory body) to dodge vi.mock hoisting,
  // and to return the REAL defaults so the async settings scan stays valid.
  readExtensionSettings: vi.fn(async () => {
    const { DEFAULT_EXTENSION_SETTINGS } = await import('@quikfill/schemas')
    return DEFAULT_EXTENSION_SETTINGS
  }),
  requestAiFill: vi.fn(async () => ({ ok: false, reason: 'error' as const })),
  onEntitlementsChange: vi.fn(() => () => {}),
  onExtensionSettingsChange: vi.fn(() => () => {}),
}))

import { mountOverlay } from './overlay'

/**
 * Minimal stand-in for the real ResizeObserver (jsdom ships none). Records what it
 * observes/unobserves and exposes the registered callback so a test can fire a
 * resize the way the browser would.
 */
class FakeResizeObserver {
  static last: FakeResizeObserver | undefined
  readonly cb: ResizeObserverCallback
  readonly observed = new Set<Element>()
  readonly unobserved: Element[] = []
  disconnected = false
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
    FakeResizeObserver.last = this
  }
  observe(el: Element): void {
    this.observed.add(el)
  }
  unobserve(el: Element): void {
    this.observed.delete(el)
    this.unobserved.push(el)
  }
  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }
}

/** Drain the async entitlement/settings reads that re-scan after mount. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function mountWithForm() {
  document.body.innerHTML = `
    <form id="signup">
      <label for="e">Email</label>
      <input id="e" name="email" type="email" />
      <label for="p">Password</label>
      <input id="p" name="password" type="password" />
      <button type="submit">Create account</button>
    </form>
  `
  return mountOverlay(document)
}

let originalResizeObserver: typeof ResizeObserver

beforeEach(() => {
  originalResizeObserver = window.ResizeObserver
  window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  FakeResizeObserver.last = undefined
  document.body.innerHTML = ''
})

afterEach(() => {
  window.ResizeObserver = originalResizeObserver
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('overlay anchor ResizeObserver', () => {
  it("observes the form's box so the button tracks size changes", async () => {
    const handle = mountWithForm()
    await flush()

    const form = document.getElementById('signup')!
    const ro = FakeResizeObserver.last
    expect(ro).toBeDefined()
    expect(ro!.observed.has(form)).toBe(true)

    handle.destroy()
  })

  it('schedules a reposition (via rAF) when an observed form resizes', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as unknown as number)
    const handle = mountWithForm()
    await flush()

    const ro = FakeResizeObserver.last!
    rafSpy.mockClear() // ignore any frames scheduled during mount
    ro.cb([], ro as unknown as ResizeObserver)
    expect(rafSpy).toHaveBeenCalledTimes(1)

    handle.destroy()
  })

  it('unobserves the form box once the form is gone', async () => {
    const handle = mountWithForm()
    await flush()

    const form = document.getElementById('signup')!
    const ro = FakeResizeObserver.last!
    expect(ro.observed.has(form)).toBe(true)

    form.remove()
    handle.rescan()

    expect(ro.observed.has(form)).toBe(false)
    expect(ro.unobserved).toContain(form)

    handle.destroy()
  })

  it('disconnects the ResizeObserver on destroy', async () => {
    const handle = mountWithForm()
    await flush()

    const ro = FakeResizeObserver.last!
    handle.destroy()
    expect(ro.disconnected).toBe(true)
  })
})
