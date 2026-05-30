import type { FillResult, UndoSnapshot } from '@quikfill/schemas'

/**
 * Mirror of form-scanner's `FillOutcome`: per-node results plus the snapshot the
 * caller keeps to undo the batch. Named distinctly to avoid import confusion.
 */
export interface FigmaFillOutcome {
  results: FillResult[]
  undoSnapshot: UndoSnapshot
}

/** A Figma locator — the analog of a DOM selector. Compile-time only (not a schema). */
export interface FigmaNodeRef {
  nodeId: string
  framePath: string[]
  pageId?: string
}

/**
 * Result of ensuring a text node's fonts are loaded before a write. `ready` →
 * safe to set `characters`; `missing`/`mixedUnhandled` → the filler skips the node
 * with a reason rather than throwing. Same-realm value, so a plain TS union.
 */
export type FontLoadOutcome =
  | { status: 'ready' }
  | { status: 'missing'; fonts: FontName[] }
  | { status: 'mixedUnhandled' }
