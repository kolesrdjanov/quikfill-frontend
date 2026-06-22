import { z } from 'zod'

/**
 * The same-page `window.postMessage` contract between the QuikFill web app and the
 * extension's content script, used to bootstrap a zero-click session handoff.
 *
 * Only a one-time handoff code ever crosses this channel — never a token. Both
 * sides MUST additionally validate `event.origin` and `event.source === window`
 * before trusting a message; these schemas only validate the message *shape*.
 */

/** Content script → page: "the extension is installed and signed out — hand off if you can." */
export const QF_EXT_HELLO = 'qf-ext-hello' as const

/** Page (web app) → content script: a freshly minted, single-use handoff code. */
export const QF_EXT_HANDOFF = 'qf-ext-handoff' as const

export const extHelloMessageSchema = z.object({
  type: z.literal(QF_EXT_HELLO),
})
export type ExtHelloMessage = z.infer<typeof extHelloMessageSchema>

export const extHandoffMessageSchema = z.object({
  type: z.literal(QF_EXT_HANDOFF),
  code: z.string().min(1),
})
export type ExtHandoffMessage = z.infer<typeof extHandoffMessageSchema>
