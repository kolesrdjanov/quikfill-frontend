/// <reference types="chrome" />
import type {
  FillInstruction,
  FillResult,
  ScanOptions,
  ScanResult,
  UndoSnapshot,
} from '@quikfill/schemas'

/** Message asking a tab's content script to scan the page. */
export const SCAN_REQUEST = 'SCAN_REQUEST'
/** Message asking the content script to apply a batch of fill instructions. */
export const FILL_REQUEST = 'FILL_REQUEST'
/** Message asking the content script to restore a captured undo snapshot. */
export const UNDO_REQUEST = 'UNDO_REQUEST'

export interface ScanRequestMessage {
  type: typeof SCAN_REQUEST
  options?: ScanOptions
}
export interface FillRequestMessage {
  type: typeof FILL_REQUEST
  instructions: FillInstruction[]
}
export interface UndoRequestMessage {
  type: typeof UNDO_REQUEST
  snapshot: UndoSnapshot
}

/** Response to a FILL_REQUEST: per-field results + the snapshot to undo with. */
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

/** Id of the active tab in the current window, or undefined if none. */
export async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

/** Ask a specific tab to scan; resolves with its ScanResult. */
export async function requestScan(tabId: number, options?: ScanOptions): Promise<ScanResult> {
  return chrome.tabs.sendMessage(tabId, {
    type: SCAN_REQUEST,
    options,
  } satisfies ScanRequestMessage)
}

/**
 * Register a content-script handler for scan requests. Returning `true` from the
 * listener keeps the message channel open for the async `sendResponse`.
 */
export function onScanRequest(
  handler: (options: ScanOptions | undefined) => ScanResult | Promise<ScanResult>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isScanRequest(message)) return undefined
    Promise.resolve(handler(message.options)).then(sendResponse)
    return true
  })
}

/** Ask a tab to apply fill instructions; resolves with results + undo snapshot. */
export async function requestFill(
  tabId: number,
  instructions: FillInstruction[],
): Promise<FillResponse> {
  return chrome.tabs.sendMessage(tabId, {
    type: FILL_REQUEST,
    instructions,
  } satisfies FillRequestMessage)
}

export function onFillRequest(
  handler: (instructions: FillInstruction[]) => FillResponse | Promise<FillResponse>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isFillRequest(message)) return undefined
    Promise.resolve(handler(message.instructions)).then(sendResponse)
    return true
  })
}

/** Ask a tab to restore a captured undo snapshot; resolves with results. */
export async function requestUndo(tabId: number, snapshot: UndoSnapshot): Promise<FillResult[]> {
  return chrome.tabs.sendMessage(tabId, {
    type: UNDO_REQUEST,
    snapshot,
  } satisfies UndoRequestMessage)
}

export function onUndoRequest(
  handler: (snapshot: UndoSnapshot) => FillResult[] | Promise<FillResult[]>,
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isUndoRequest(message)) return undefined
    Promise.resolve(handler(message.snapshot)).then(sendResponse)
    return true
  })
}
