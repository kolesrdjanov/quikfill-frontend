/// <reference types="chrome" />
import type { AuthErrorKind, AuthState } from '@quikfill/schemas'

/**
 * Surface → background auth messages. All auth (and the api-client that performs
 * it) lives in the background worker; sidepanel/popup/options drive it through
 * these messages so no token or base URL ever reaches a content script. Modeled
 * on `ai-messaging` — the helpers never throw.
 */
export const AUTH_REQUEST = 'AUTH_REQUEST'

export type AuthRequestMessage =
  | { type: typeof AUTH_REQUEST; action: 'get-state' }
  | { type: typeof AUTH_REQUEST; action: 'request-code'; email: string }
  | { type: typeof AUTH_REQUEST; action: 'verify'; email: string; code: string }
  | { type: typeof AUTH_REQUEST; action: 'logout' }
  | { type: typeof AUTH_REQUEST; action: 'adopt-handoff'; code: string }

/** Background → surface reply for `request-code` (`devCode` only outside production). */
export type RequestCodeResponse =
  | { ok: true; devCode?: string }
  | { ok: false; error: AuthErrorKind }
/** Background → surface reply for `verify` — carries the resulting signed-in state. */
export type VerifyResponse = { ok: true; state: AuthState } | { ok: false; error: AuthErrorKind }
/** Logout is best-effort and always reported as done. */
export type LogoutResponse = { ok: true }

export function isAuthRequest(message: unknown): message is AuthRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === AUTH_REQUEST
  )
}

async function send<T>(message: AuthRequestMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T
}

/** Read the current auth snapshot from the background. Unreachable ⇒ network error. */
export async function requestAuthState(): Promise<AuthState> {
  try {
    return await send<AuthState>({ type: AUTH_REQUEST, action: 'get-state' })
  } catch {
    return { status: 'error', error: 'network' }
  }
}

/** Ask the backend to email a sign-in OTP. Unreachable ⇒ network error. */
export async function requestAuthCode(email: string): Promise<RequestCodeResponse> {
  try {
    return await send<RequestCodeResponse>({ type: AUTH_REQUEST, action: 'request-code', email })
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Exchange an email + OTP for a session. Unreachable ⇒ network error. */
export async function verifyAuthCode(email: string, code: string): Promise<VerifyResponse> {
  try {
    return await send<VerifyResponse>({ type: AUTH_REQUEST, action: 'verify', email, code })
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Adopt a web-app session by redeeming a one-time handoff code. Unreachable ⇒ network error. */
export async function adoptHandoff(code: string): Promise<VerifyResponse> {
  try {
    return await send<VerifyResponse>({ type: AUTH_REQUEST, action: 'adopt-handoff', code })
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** End the session. Best-effort: an unreachable background is treated as done. */
export async function logoutAuth(): Promise<LogoutResponse> {
  try {
    await send<LogoutResponse>({ type: AUTH_REQUEST, action: 'logout' })
  } catch {
    /* already gone */
  }
  return { ok: true }
}

/** The background-side implementations the registrar dispatches to. */
export interface AuthHandlers {
  getState(): AuthState | Promise<AuthState>
  requestCode(email: string): RequestCodeResponse | Promise<RequestCodeResponse>
  verify(email: string, code: string): VerifyResponse | Promise<VerifyResponse>
  logout(): LogoutResponse | Promise<LogoutResponse>
  adoptHandoff(code: string): VerifyResponse | Promise<VerifyResponse>
}

/**
 * Register the background handler for every auth action. Returns `true` to keep
 * the message channel open for the async `sendResponse`. A handler that throws
 * is reported as a typed `unknown` failure rather than crashing the worker
 * (handlers are expected to map known errors themselves).
 */
export function onAuthRequest(handlers: AuthHandlers): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isAuthRequest(message)) return undefined
    const run = async (): Promise<unknown> => {
      switch (message.action) {
        case 'get-state':
          return handlers.getState()
        case 'request-code':
          return handlers.requestCode(message.email)
        case 'verify':
          return handlers.verify(message.email, message.code)
        case 'logout':
          return handlers.logout()
        case 'adopt-handoff':
          return handlers.adoptHandoff(message.code)
      }
    }
    run()
      .then((response) => sendResponse(response))
      .catch(() => {
        // Safety net: handlers map known errors; an unexpected throw is `unknown`.
        sendResponse(
          message.action === 'get-state'
            ? ({ status: 'error', error: 'unknown' } satisfies AuthState)
            : message.action === 'logout'
              ? ({ ok: true } satisfies LogoutResponse)
              : ({ ok: false, error: 'unknown' } satisfies RequestCodeResponse),
        )
      })
    return true
  })
}
