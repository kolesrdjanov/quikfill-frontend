import { describe, expect, it, vi } from 'vitest'
import { QF_EXT_HELLO, QF_EXT_HANDOFF } from '@quikfill/schemas'
import { createHandoffContentBridge } from './handoff-content-bridge'

const ORIGIN = 'https://app.quikfill.io'

function fakeWindow() {
  let listener: ((e: MessageEvent) => void) | undefined
  const win = {
    addEventListener: vi.fn((_type: string, l: EventListener) => {
      listener = l as unknown as (e: MessageEvent) => void
    }),
    removeEventListener: vi.fn(() => {
      listener = undefined
    }),
    postMessage: vi.fn(),
  }
  const deliver = (data: unknown, opts: { origin?: string; source?: unknown } = {}) =>
    listener?.({
      data,
      origin: opts.origin ?? ORIGIN,
      source: 'source' in opts ? opts.source : win,
    } as MessageEvent)
  return { win, deliver, hasListener: () => listener !== undefined }
}

function setup(opts: { signedIn?: boolean } = {}) {
  const { win, deliver, hasListener } = fakeWindow()
  const adopt = vi.fn().mockResolvedValue(undefined)
  const bridge = createHandoffContentBridge({
    origin: ORIGIN,
    target: win as unknown as Window,
    isSignedIn: () => Promise.resolve(opts.signedIn ?? false),
    adopt,
  })
  return { win, deliver, hasListener, adopt, bridge }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createHandoffContentBridge', () => {
  it('announces hello when signed out and adopts a handoff code', async () => {
    const { win, deliver, adopt, bridge } = setup({ signedIn: false })
    await bridge.start()

    expect(win.postMessage).toHaveBeenCalledWith({ type: QF_EXT_HELLO }, ORIGIN)

    deliver({ type: QF_EXT_HANDOFF, code: 'h4nd0ff' })
    await flush()
    expect(adopt).toHaveBeenCalledWith('h4nd0ff')
  })

  it('does nothing when the extension is already signed in', async () => {
    const { win, adopt, hasListener, bridge } = setup({ signedIn: true })
    await bridge.start()

    expect(win.postMessage).not.toHaveBeenCalled()
    expect(hasListener()).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('ignores a handoff from a foreign origin', async () => {
    const { deliver, adopt, bridge } = setup({ signedIn: false })
    await bridge.start()

    deliver({ type: QF_EXT_HANDOFF, code: 'h4nd0ff' }, { origin: 'https://evil.example' })
    await flush()
    expect(adopt).not.toHaveBeenCalled()
  })

  it('ignores a handoff whose source is not this window', async () => {
    const { deliver, adopt, bridge } = setup({ signedIn: false })
    await bridge.start()

    deliver({ type: QF_EXT_HANDOFF, code: 'h4nd0ff' }, { source: {} })
    await flush()
    expect(adopt).not.toHaveBeenCalled()
  })

  it('ignores malformed handoff messages', async () => {
    const { deliver, adopt, bridge } = setup({ signedIn: false })
    await bridge.start()

    deliver({ type: QF_EXT_HANDOFF }) // missing code
    deliver({ type: QF_EXT_HELLO }) // not a handoff
    deliver('not-an-object')
    await flush()
    expect(adopt).not.toHaveBeenCalled()
  })

  it('start() returns a teardown that removes the listener', async () => {
    const { win, bridge } = setup({ signedIn: false })
    const stop = await bridge.start()
    stop()
    expect(win.removeEventListener).toHaveBeenCalled()
  })
})
