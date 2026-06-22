import { extHandoffMessageSchema, QF_EXT_HELLO } from '@quikfill/schemas'

export interface HandoffContentBridgeDeps {
  /** The app origin (also this page's origin); the postMessage target/filter. */
  origin: string
  /** The window to listen on and post to. */
  target: Window
  /** Whether the extension already holds a session (skip the handoff if so). */
  isSignedIn: () => Promise<boolean>
  /** Redeem a one-time handoff code into the extension's own session. */
  adopt: (code: string) => Promise<void>
}

/**
 * The extension content-script side of the zero-click session handoff, run only on
 * the QuikFill app origin. When the extension is signed out it announces itself to
 * the page (`QF_EXT_HELLO`); the web app replies with a one-time code
 * (`QF_EXT_HANDOFF`) which is redeemed into the extension's own session.
 *
 * Only ever carries a single-use code — never a token. Every inbound message is
 * checked for same-window origin/source before its shape is trusted.
 */
export function createHandoffContentBridge(deps: HandoffContentBridgeDeps): {
  start(): Promise<() => void>
} {
  const { origin, target, isSignedIn, adopt } = deps
  const noop = () => {}

  function onMessage(event: MessageEvent): void {
    // Trust only same-origin messages from this very window (the web app on the page).
    if (event.source !== target || event.origin !== origin) return
    const parsed = extHandoffMessageSchema.safeParse(event.data)
    if (!parsed.success) return
    void adopt(parsed.data.code)
  }

  async function start(): Promise<() => void> {
    // An already-signed-in extension needs no handoff — and announcing would make
    // the app mint a needless code. Only a signed-out surface asks for one.
    if (await isSignedIn()) return noop
    target.addEventListener('message', onMessage)
    target.postMessage({ type: QF_EXT_HELLO }, origin)
    return () => target.removeEventListener('message', onMessage)
  }

  return { start }
}
