/// <reference types="chrome" />
import type { ProfileBundle } from './profile-store'

/**
 * Surface → background profile-sync messages. The api-client (and the token it
 * carries) lives only in the background worker, so the sidepanel/popup drive
 * backend sync through these messages — never touching `chrome.*` or the network
 * directly. Modeled on `auth-messaging` / `ai-messaging`; the send helpers never
 * throw (an unreachable worker is reported as a failed result).
 */
export const PROFILE_SYNC = 'PROFILE_SYNC'

export type ProfileSyncMessage =
  | { type: typeof PROFILE_SYNC; action: 'push-bundle'; bundle: ProfileBundle }
  | { type: typeof PROFILE_SYNC; action: 'reconcile' }

/** Background → surface reply for a single write-through push. */
export type PushResult = { ok: true } | { ok: false; error: string }
/**
 * Background → surface reply for a full reconcile, with how much moved each way.
 * `failed` counts records skipped because they couldn't be pushed (e.g. a
 * malformed/legacy local record the backend rejects) — the rest still sync.
 */
export type ReconcileResult =
  | { ok: true; pushed: number; pulled: number; failed: number }
  | { ok: false; error: string }

/** The background-side implementations the registrar dispatches to. */
export interface SyncHandlers {
  pushBundle(bundle: ProfileBundle): Promise<PushResult>
  reconcile(): Promise<ReconcileResult>
}

export function isProfileSyncRequest(message: unknown): message is ProfileSyncMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === PROFILE_SYNC
  )
}

async function send<T>(message: ProfileSyncMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T
}

/** Write one saved bundle through to the backend. Unreachable ⇒ failed result. */
export async function requestProfilePush(bundle: ProfileBundle): Promise<PushResult> {
  try {
    return await send<PushResult>({ type: PROFILE_SYNC, action: 'push-bundle', bundle })
  } catch {
    return { ok: false, error: 'unreachable' }
  }
}

/** Run a full two-way reconcile. Unreachable ⇒ failed result. */
export async function requestProfileReconcile(): Promise<ReconcileResult> {
  try {
    return await send<ReconcileResult>({ type: PROFILE_SYNC, action: 'reconcile' })
  } catch {
    return { ok: false, error: 'unreachable' }
  }
}

/**
 * Register the background handler for every profile-sync action. Returns `true`
 * to keep the message channel open for the async `sendResponse`. A handler that
 * throws is reported as a failed result rather than crashing the worker.
 */
export function onProfileSyncRequest(handlers: SyncHandlers): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isProfileSyncRequest(message)) return undefined
    const run = async (): Promise<unknown> => {
      switch (message.action) {
        case 'push-bundle':
          return handlers.pushBundle(message.bundle)
        case 'reconcile':
          return handlers.reconcile()
      }
    }
    run()
      .then((response) => sendResponse(response))
      .catch(() => sendResponse({ ok: false, error: 'unknown' }))
    return true
  })
}
