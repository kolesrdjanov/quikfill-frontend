import type { FontLoadOutcome } from './types'

/** True when a value is the `figma.mixed` sentinel (a node with >1 font). */
export function isMixed(value: unknown): boolean {
  return value === figma.mixed
}

function fontKey(font: FontName): string {
  return `${font.family} ${font.style}`
}

/**
 * The distinct fonts a text node uses. For a `figma.mixed` node this is one
 * `getRangeAllFontNames` call (not O(n) per character), deduped by family+style.
 */
export function fontsOfNode(node: TextNode): FontName[] {
  if (!isMixed(node.fontName)) return [node.fontName as FontName]
  const seen = new Map<string, FontName>()
  for (const font of node.getRangeAllFontNames(0, node.characters.length)) {
    if (!seen.has(fontKey(font))) seen.set(fontKey(font), font)
  }
  return [...seen.values()]
}

/**
 * Ensure a node's font is loaded before writing `characters` (Figma throws
 * otherwise). Never throws — downgrades problems to a skippable outcome:
 * - `mixedUnhandled`: the node uses multiple fonts; overwriting via `characters`
 *   would drop the per-range styling, so v1 skips it.
 * - `missing`: `loadFontAsync` rejected (font not installed/available).
 * - `ready`: the single font is loaded and the node is safe to write.
 */
export async function ensureFontsLoaded(node: TextNode): Promise<FontLoadOutcome> {
  if (isMixed(node.fontName)) {
    return { status: 'mixedUnhandled' }
  }
  const font = node.fontName as FontName
  try {
    await figma.loadFontAsync(font)
    return { status: 'ready' }
  } catch {
    return { status: 'missing', fonts: [font] }
  }
}
