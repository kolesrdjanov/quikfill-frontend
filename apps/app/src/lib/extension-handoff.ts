import { extHelloMessageSchema, QF_EXT_HANDOFF } from '@quikfill/schemas'

export interface ExtensionHandoffDeps {
  /** This app's own origin — both the message filter and the postMessage target. */
  origin: string
  /** Whether the user currently has a session. */
  isSignedIn: () => boolean
  /** Mint a one-time handoff code from the (authenticated) API. */
  mintCode: () => Promise<string>
  /** The window to listen on and post back to. */
  target: Window
}

export interface ExtensionHandoffBridge {
  /** Start listening for the extension's hello. Returns a teardown function. */
  start(): () => void
  /** Tell the bridge the user just signed in, so a deferred handoff can complete. */
  notifySignedIn(): void
}

/**
 * The web-app side of the zero-click session handoff. When the QuikFill extension's
 * content script announces itself on this page (`QF_EXT_HELLO`), the bridge mints a
 * one-time code (using the app's *own* authenticated session) and posts it back
 * (`QF_EXT_HANDOFF`) for the extension to redeem into its own session.
 *
 * Only ever emits a single-use code — never a token. If the hello arrives while
 * signed out, the handoff is deferred until {@link ExtensionHandoffBridge.notifySignedIn}.
 */
export function createExtensionHandoffBridge(deps: ExtensionHandoffDeps): ExtensionHandoffBridge {
  const { origin, isSignedIn, mintCode, target } = deps
  let pending = false

  async function maybeHandoff(): Promise<void> {
    if (!pending || !isSignedIn()) return
    pending = false // claim synchronously so concurrent triggers can't double-mint
    try {
      const code = await mintCode()
      target.postMessage({ type: QF_EXT_HANDOFF, code }, origin)
    } catch {
      // Mint failed (e.g. the access token expired mid-flight) — let a later
      // trigger retry rather than dropping the handoff silently.
      pending = true
    }
  }

  function onMessage(event: MessageEvent): void {
    // Only trust same-origin messages originating from this very window — i.e. the
    // extension content script's same-page bridge, not a cross-frame sender.
    if (event.source !== target || event.origin !== origin) return
    if (!extHelloMessageSchema.safeParse(event.data).success) return
    pending = true
    void maybeHandoff()
  }

  function start(): () => void {
    target.addEventListener('message', onMessage)
    return () => target.removeEventListener('message', onMessage)
  }

  function notifySignedIn(): void {
    void maybeHandoff()
  }

  return { start, notifySignedIn }
}
