import { createAiClient } from '@quikfill/api-client'
import { onAiClassifyRequest } from '@quikfill/browser-adapter'

// The backend owns the Gemini key; the background worker is the only place the
// api-client runs so no token or base URL ever reaches a content script.
// Iteration 10 replaces this with configured + authenticated transport.
const AI_API_BASE_URL = 'http://localhost:4010/api/v1'

export default defineBackground(() => {
  // Open the side panel (the primary UI) when the toolbar icon is clicked.
  browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})

  const ai = createAiClient({ baseUrl: AI_API_BASE_URL })
  onAiClassifyRequest((summaries) => ai.classifyFields(summaries))
})
