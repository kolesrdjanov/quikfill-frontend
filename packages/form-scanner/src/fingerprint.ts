import type { DetectedField, FieldFingerprint } from '@quikfill/schemas'
import { fnv1aHex } from './hash'

/** Inputs that make a field's identity stable across benign DOM changes. */
export interface FingerprintInput {
  label?: string
  name?: string
  type?: string
  options?: string[]
  section?: string
}

function canonical(input: FingerprintInput): string {
  // Deterministic key order; options sorted so reordering doesn't change identity.
  const parts = [
    `label:${input.label ?? ''}`,
    `name:${input.name ?? ''}`,
    `type:${input.type ?? ''}`,
    `section:${input.section ?? ''}`,
    `options:${(input.options ?? []).slice().sort().join('|')}`,
  ]
  return parts.join('::').toLowerCase()
}

/** Build the FieldFingerprint (inputs + hash) for a set of identity inputs. */
export function fingerprint(input: FingerprintInput): FieldFingerprint {
  return { hash: fnv1aHex(canonical(input)), inputs: input }
}

/**
 * Stable hash over a form's field structure: ordered (type, label) pairs.
 * Survives value/attribute changes but reflects fields being added/removed.
 */
export function structureHash(fields: Pick<DetectedField, 'inputType' | 'labelText'>[]): string {
  const signature = fields
    .map((f) => `${f.inputType}:${(f.labelText ?? '').toLowerCase()}`)
    .join('|')
  return fnv1aHex(signature)
}
