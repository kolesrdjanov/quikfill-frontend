export interface WidgetOperation {
  signal?: AbortSignal
  isCurrent?: () => boolean
}
export const WIDGET_TIMEOUT_MS = 2500
export function operationActive(options: WidgetOperation = {}): boolean {
  return !options.signal?.aborted && options.isCurrent?.() !== false
}
/** Bound async rendering without fixed sleeps or late writes after cancellation. */
export async function waitForWidget<T>(
  read: () => T | null | undefined | false,
  options: WidgetOperation = {},
  timeout = WIDGET_TIMEOUT_MS,
): Promise<T | null> {
  const deadline = Date.now() + timeout
  while (operationActive(options)) {
    const value = read()
    if (value) return value
    if (Date.now() >= deadline) return null
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, 40)
      options.signal?.addEventListener('abort', finish, { once: true })
    })
  }
  return null
}
