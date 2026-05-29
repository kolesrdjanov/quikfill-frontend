/**
 * FNV-1a 32-bit hash → 8-char hex. Deterministic and dependency-free; good
 * enough for stable field/structure fingerprints (not for security).
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // hash *= 16777619, kept in 32-bit range via Math.imul
    hash = Math.imul(hash, 0x01000193)
  }
  // >>> 0 coerces to unsigned 32-bit before hex formatting
  return (hash >>> 0).toString(16).padStart(8, '0')
}
