import {
  adoptHandoff,
  onFillRequest,
  onScanRequest,
  onUndoRequest,
  requestAuthState,
} from '@quikfill/browser-adapter'
import { applyFill, applyUndo, resolveScopeRoot, scanForms } from '@quikfill/form-scanner'
import { DASHBOARD_URL } from '../lib/external-urls'
import { createHandoffContentBridge } from '../lib/handoff-content-bridge'
import { mountOverlay } from './content/overlay'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Thin DOM agent: scan, fill, and undo on request. The only product decision
    // here is resolving which container to scan — it needs the live DOM + focus.

    // The in-page fill flow: auto-detect forms and inject floating "Fill" buttons
    // (isolated Shadow DOM). It owns its own lifecycle (observer + listeners) and
    // delegates the backend call to the background worker via requestAiFill. The
    // legacy scan/fill/undo message handlers below stay for the surface's scan form.
    mountOverlay(document)

    // Zero-click cross-surface session handoff: only on the QuikFill app origin. A
    // signed-out extension announces itself to the page and adopts any one-time code
    // the web app hands back — so a session created in the web app flows into the
    // extension with no second sign-in. Only a code crosses; tokens stay in the bg.
    if (window.location.origin === DASHBOARD_URL) {
      void createHandoffContentBridge({
        origin: window.location.origin,
        target: window,
        isSignedIn: async () => (await requestAuthState()).status === 'signed-in',
        adopt: async (code) => {
          await adoptHandoff(code)
        },
      }).start()
    }

    // The container the last scan resolved to (a drawer/dialog element, or the
    // whole document). Fill/undo are confined to it so a fuzzy selector can never
    // resolve to an element OUTSIDE the drawer — e.g. a focused navbar search —
    // which, when written, trips a click-outside drawer's dismiss mid-fill.
    let lastScanRoot: Document | Element = document

    onScanRequest((options) => {
      const opts = options ?? { includeHidden: false, scope: 'auto' as const }
      const resolved = resolveScopeRoot(document, opts.scope ?? 'auto')
      lastScanRoot = resolved.root
      const result = scanForms(resolved.root, opts)
      return {
        ...result,
        scope: {
          kind: resolved.kind,
          label: resolved.label,
          fieldCount: result.fields.length,
          requested: opts.scope ?? 'auto',
        },
      }
    })
    onFillRequest((instructions) => applyFill(instructions, fillRoot()))
    onUndoRequest((snapshot) => applyUndo(snapshot, fillRoot()))

    // Reuse the scanned container only while it's still attached. A drawer that was
    // re-rendered or closed since the scan leaves a detached node, so fall back to
    // the whole document rather than confine the fill to an orphan and match nothing.
    function fillRoot(): Document | Element {
      if (lastScanRoot === document) return document
      const el = lastScanRoot as Element
      return el.isConnected ? el : document
    }
  },
})
