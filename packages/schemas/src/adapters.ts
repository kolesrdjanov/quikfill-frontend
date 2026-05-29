import type { Domain, FormProfile } from './form-profile'
import type { FieldMapping } from './field-mapping'
import type { GeneratorPreset } from './generator'
import type { EntityRecord, EntityType } from './entity'
import type { FillRun } from './fill'

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

/** The entities that participate in backend sync. */
export type SyncEntityKind =
  | 'domain'
  | 'formProfile'
  | 'fieldMapping'
  | 'generatorPreset'
  | 'entityType'
  | 'entityRecord'
  | 'fillRun'

/** A snapshot of everything changed since a cursor (`GET /sync/snapshot?since=`). */
export interface SyncSnapshot {
  /** Max `updatedAt` represented in this snapshot; the next request's cursor. */
  cursor: string
  domains: Domain[]
  formProfiles: FormProfile[]
  fieldMappings: FieldMapping[]
  generatorPresets: GeneratorPreset[]
  entityTypes: EntityType[]
  entityRecords: EntityRecord[]
  fillRuns: FillRun[]
}

/** A single locally-changed record to push. Idempotent on `id` server-side. */
export interface SyncChange {
  id: string
  entityKind: SyncEntityKind
  payload: unknown
  updatedAt: string
  deleted?: boolean
}

/**
 * Backend sync surface (`GET /sync/snapshot`, `POST /sync/push`). Last-write-wins
 * by `updatedAt`; client-supplied UUIDs make push idempotent.
 */
export interface SyncAdapter {
  snapshot(since?: string): Promise<SyncSnapshot>
  push(changes: SyncChange[]): Promise<void>
}
