import { onFillRequest, onScanRequest, onUndoRequest } from '@quikfill/browser-adapter'
import { applyFill, applyUndo, scanForms } from '@quikfill/form-scanner'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Thin DOM agent: scan, fill, and undo on request. No product decisions.
    onScanRequest((options) => scanForms(document, options))
    onFillRequest((instructions) => applyFill(instructions))
    onUndoRequest((snapshot) => applyUndo(snapshot))
  },
})
