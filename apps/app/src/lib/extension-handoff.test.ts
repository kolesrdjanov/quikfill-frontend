import { describe, expect, it, vi } from 'vitest'
import { QF_EXT_HELLO, QF_EXT_HANDOFF } from '@quikfill/schemas'
import { createExtensionHandoffBridge } from './extension-handoff'

const ORIGIN = 'https://app.quikfill.io'

/** A minimal stand-in for `window` that lets a test deliver synthetic messages. */
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
  return { win, deliver }
}

function setup(opts: { signedIn?: boolean } = {}) {
  const { win, deliver } = fakeWindow()
  let signedIn = opts.signedIn ?? false
  const mintCode = vi.fn().mockResolvedValue('h4nd0ff')
  const bridge = createExtensionHandoffBridge({
    origin: ORIGIN,
    isSignedIn: () => signedIn,
    mintCode,
    target: win as unknown as Window,
  })
  return { win, deliver, bridge, mintCode, setSignedIn: (v: boolean) => (signedIn = v) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createExtensionHandoffBridge', () => {
  it('mints and posts a handoff code when the extension says hello while signed in', async () => {
    const { win, deliver, bridge, mintCode } = setup({ signedIn: true })
    bridge.start()

    deliver({ type: QF_EXT_HELLO })
    await flush()

    expect(mintCode).toHaveBeenCalledTimes(1)
    expect(win.postMessage).toHaveBeenCalledWith({ type: QF_EXT_HANDOFF, code: 'h4nd0ff' }, ORIGIN)
  })

  it('defers until sign-in when the hello arrives while signed out', async () => {
    const { win, deliver, bridge, mintCode, setSignedIn } = setup({ signedIn: false })
    bridge.start()

    deliver({ type: QF_EXT_HELLO })
    await flush()
    expect(mintCode).not.toHaveBeenCalled()

    setSignedIn(true)
    bridge.notifySignedIn()
    await flush()
    expect(win.postMessage).toHaveBeenCalledWith({ type: QF_EXT_HANDOFF, code: 'h4nd0ff' }, ORIGIN)
  })

  it('ignores a hello from a foreign origin', async () => {
    const { win, deliver, bridge, mintCode } = setup({ signedIn: true })
    bridge.start()

    deliver({ type: QF_EXT_HELLO }, { origin: 'https://evil.example' })
    await flush()

    expect(mintCode).not.toHaveBeenCalled()
    expect(win.postMessage).not.toHaveBeenCalled()
  })

  it('ignores a message whose source is not this window', async () => {
    const { deliver, bridge, mintCode } = setup({ signedIn: true })
    bridge.start()

    deliver({ type: QF_EXT_HELLO }, { source: {} })
    await flush()

    expect(mintCode).not.toHaveBeenCalled()
  })

  it('ignores malformed or unrelated messages', async () => {
    const { deliver, bridge, mintCode } = setup({ signedIn: true })
    bridge.start()

    deliver({ type: 'something-else' })
    deliver({ nope: true })
    deliver('not-an-object')
    await flush()

    expect(mintCode).not.toHaveBeenCalled()
  })

  it('start() returns a teardown that removes the listener', () => {
    const { win, bridge } = setup()
    const stop = bridge.start()
    stop()
    expect(win.removeEventListener).toHaveBeenCalled()
  })
})
