/**
 * Key/value persistence behind which the local-first store hides. The Chrome
 * `chrome.storage` implementation lives in `browser-adapter`; the backend-backed
 * one is added later. Feature code only ever sees this interface.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

// Sync rides the per-resource CRUD endpoints (idempotent create by client UUID
// with server-side last-write-wins on `updatedAt`); the background worker
// reconciles both ways. There is no dedicated batch-sync surface — the prototype
// `/sync/push` + `/sync/snapshot` module was removed as unused, so the
// `SyncAdapter`/`SyncSnapshot` contract that mirrored it is gone too.
