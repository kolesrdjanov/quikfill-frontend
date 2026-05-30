import type { DetectedField } from '@quikfill/schemas'

/**
 * FNV-1a 32-bit → 8-char hex. A local copy of `form-scanner/hash.ts` (we never
 * import that DOM-coupled package). Deterministic, dependency-free; not for security.
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Inputs that make a Figma node's identity stable across benign edits. */
export interface FigmaFingerprintInput {
  /** Ordered ancestor frame/component names, outermost first. */
  framePath: string[]
  layerName?: string
  /** Node kind, e.g. `'TEXT'`. */
  nodeKind: string
}

function canonical(input: FigmaFingerprintInput): string {
  return [
    `frame:${input.framePath.join('/')}`,
    `layer:${input.layerName ?? ''}`,
    `kind:${input.nodeKind}`,
  ]
    .join('::')
    .toLowerCase()
}

/**
 * Stable per-node fingerprint for `DetectedField.domFingerprint` — the key saved
 * mappings match on (the cross-surface persona moat). **Best-effort** under benign
 * edits: derived from the ancestor frame-name PATH + layer name + kind, deliberately
 * excluding the volatile `node.id` and absolute position (mirrors `form-scanner`
 * excluding the section heading). Known break cases: renaming an ancestor frame or
 * the layer, and duplicating the file. A guarantee is impossible — no input survives
 * both rename and duplication; this picks stability under cosmetic moves.
 */
export function figmaFingerprint(input: FigmaFingerprintInput): string {
  return fnv1aHex(canonical(input))
}

/**
 * Stable hash over a scan's field structure — a **verbatim** copy of
 * `form-scanner/structureHash`'s format (`${inputType}:${labelText}` pairs joined
 * by `|`), so the two realms produce the same value for the same field list.
 */
export function figmaStructureHash(
  fields: Pick<DetectedField, 'inputType' | 'labelText'>[],
): string {
  const signature = fields
    .map((f) => `${f.inputType}:${(f.labelText ?? '').toLowerCase()}`)
    .join('|')
  return fnv1aHex(signature)
}
