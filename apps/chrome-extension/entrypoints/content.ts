import { onFillRequest, onScanRequest, onUndoRequest } from '@quikfill/browser-adapter'
import { applyFill, applyUndo, resolveScopeRoot, scanForms } from '@quikfill/form-scanner'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Thin DOM agent: scan, fill, and undo on request. The only product decision
    // here is resolving which container to scan — it needs the live DOM + focus.
    onScanRequest((options) => {
      const opts = options ?? { includeHidden: false, scope: 'auto' as const }
      const resolved = resolveScopeRoot(document, opts.scope ?? 'auto')
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
    onFillRequest((instructions) => applyFill(instructions))
    onUndoRequest((snapshot) => applyUndo(snapshot))
  },
})
