/** Deterministic PRNG utilities so seeded generation is reproducible. */

/** Hash a string to a 32-bit unsigned int (FNV-1a). */
export function hashToInt(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: tiny, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  bool(): boolean
}

/**
 * Build an Rng. With a seed it is fully deterministic; without one it falls back
 * to Math.random (non-reproducible). `salt` separates streams (e.g. per field).
 */
export function createRng(seed?: string | number, salt = ''): Rng {
  const next =
    seed === undefined && salt === '' ? Math.random : mulberry32(hashToInt(`${seed ?? ''}:${salt}`))
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    bool: () => next() < 0.5,
  }
}
