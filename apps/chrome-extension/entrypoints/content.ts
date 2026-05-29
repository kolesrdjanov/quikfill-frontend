import { onScanRequest } from '@quikfill/browser-adapter'
import { scanForms } from '@quikfill/form-scanner'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Thin DOM agent: scan on request, return structured fields. No decisions.
    onScanRequest((options) => scanForms(document, options))
  },
})
