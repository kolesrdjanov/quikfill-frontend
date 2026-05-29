/// <reference types="chrome" />
import type { ScanOptions, ScanResult } from '@quikfill/schemas'

/** Message asking a tab's content script to scan the page. */
export const SCAN_REQUEST = 'SCAN_REQUEST'

export interface ScanRequestMessage {
  type: typeof SCAN_REQUEST
  options?: ScanOptions
}

export function isScanRequest(message: unknown): message is ScanRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === SCAN_REQUEST
  )
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
