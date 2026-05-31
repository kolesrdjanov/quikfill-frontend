import { onFillRequest, onScanRequest, onUndoRequest } from '@quikfill/browser-adapter'
import { applyFill, applyUndo, resolveScopeRoot, scanForms } from '@quikfill/form-scanner'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Thin DOM agent: scan, fill, and undo on request. The only product decision
    // here is resolving which container to scan — it needs the live DOM + focus.

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
