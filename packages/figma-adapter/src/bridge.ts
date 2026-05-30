import type {
  FigmaSelectionScope,
  FillInstruction,
  FillResult,
  ScanOptions,
  ScanResult,
  UndoSnapshot,
} from '@quikfill/schemas'
import type { FigmaFillOutcome } from './types'

/**
 * The sandbox half of the request/response envelope crossing the Figma
 * sandbox↔iframe boundary — the mirror of `browser-adapter/messaging.ts`. The
 * message constants/interfaces/guards are realm-shared (the iframe imports them);
 * the `on*Request` registrars + `mountSandboxBridge` are sandbox-only. The
 * iframe-side `request*` helpers live in `apps/figma-plugin` (they touch
 * `window`/`parent`, which this no-DOM package must not).
 *
 * Unlike chrome's `sendMessage` (which returns a promise), Figma's
 * `figma.ui.postMessage`/`onmessage` is one-shot, so replies are correlated by a
 * caller-supplied message `id`.
 */
export const SCAN_REQUEST = 'QF_SCAN_REQUEST'
export const FILL_REQUEST = 'QF_FILL_REQUEST'
export const UNDO_REQUEST = 'QF_UNDO_REQUEST'
export const STORAGE_REQUEST = 'QF_STORAGE_REQUEST'
export const RESPONSE = 'QF_RESPONSE'

export interface ScanRequestMessage {
  type: typeof SCAN_REQUEST
  id: string
  scope?: FigmaSelectionScope
  options?: ScanOptions
}
export interface FillRequestMessage {
  type: typeof FILL_REQUEST
  id: string
  instructions: FillInstruction[]
}
export interface UndoRequestMessage {
  type: typeof UNDO_REQUEST
  id: string
  snapshot: UndoSnapshot
}
export type StorageOp =
  | { kind: 'get'; key: string }
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'delete'; key: string }
  | { kind: 'list'; key: string }
export interface StorageRequestMessage {
  type: typeof STORAGE_REQUEST
  id: string
  op: StorageOp
}
export interface ResponseMessage {
  type: typeof RESPONSE
  id: string
  result: unknown
}

/** Response payload for a fill request: per-field results + the undo snapshot. */
export interface FillResponse {
  results: FillResult[]
  undoSnapshot: UndoSnapshot
}

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' && message !== null && (message as { type?: unknown }).type === type
  )
}
export function isScanRequest(message: unknown): message is ScanRequestMessage {
  return hasType(message, SCAN_REQUEST)
}
export function isFillRequest(message: unknown): message is FillRequestMessage {
  return hasType(message, FILL_REQUEST)
}
export function isUndoRequest(message: unknown): message is UndoRequestMessage {
  return hasType(message, UNDO_REQUEST)
}
export function isStorageRequest(message: unknown): message is StorageRequestMessage {
  return hasType(message, STORAGE_REQUEST)
}
export function isResponse(message: unknown): message is ResponseMessage {
  return hasType(message, RESPONSE)
}

export type ScanHandler = (
  scope: FigmaSelectionScope | undefined,
  options: ScanOptions | undefined,
) => ScanResult | Promise<ScanResult>
export type FillHandler = (
  instructions: FillInstruction[],
) => FigmaFillOutcome | Promise<FigmaFillOutcome>
export type UndoHandler = (snapshot: UndoSnapshot) => FillResult[] | Promise<FillResult[]>
export type StorageHandler = (op: StorageOp) => unknown | Promise<unknown>

interface Handlers {
  scan?: ScanHandler
  fill?: FillHandler
  undo?: UndoHandler
  storage?: StorageHandler
}
const handlers: Handlers = {}

export function onScanRequest(handler: ScanHandler): void {
  handlers.scan = handler
}
export function onFillRequest(handler: FillHandler): void {
  handlers.fill = handler
}
export function onUndoRequest(handler: UndoHandler): void {
  handlers.undo = handler
}
export function onStorageRequest(handler: StorageHandler): void {
  handlers.storage = handler
}

function reply(id: string, result: unknown): void {
  const response: ResponseMessage = { type: RESPONSE, id, result }
  figma.ui.postMessage(response)
}

async function dispatch(message: unknown): Promise<void> {
  if (isScanRequest(message) && handlers.scan) {
    reply(message.id, await handlers.scan(message.scope, message.options))
  } else if (isFillRequest(message) && handlers.fill) {
    reply(message.id, await handlers.fill(message.instructions))
  } else if (isUndoRequest(message) && handlers.undo) {
    reply(message.id, await handlers.undo(message.snapshot))
  } else if (isStorageRequest(message) && handlers.storage) {
    reply(message.id, await handlers.storage(message.op))
  }
}

/** Wire the registered handlers to `figma.ui.onmessage`. Call once from the sandbox entry. */
export function mountSandboxBridge(): void {
  figma.ui.onmessage = (message: unknown): void => {
    void dispatch(message)
  }
}
