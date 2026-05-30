import type { FillInstruction, FillResult, UndoEntry, UndoSnapshot } from '@quikfill/schemas'
import { ensureFontsLoaded } from './fonts'
import { QF_ID_KEY } from './scan-figma'
import type { FigmaFillOutcome } from './types'

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === 'TEXT'
}

function asTextNode(node: BaseNode | null): TextNode | null {
  return node && (node as { type?: string }).type === 'TEXT' ? (node as TextNode) : null
}

/** Resolve the target node: stable node id first, then the qf-id marker as a fallback. */
function findNode(instruction: FillInstruction): TextNode | null {
  const id = instruction.selectorCandidates[0]
  if (id) {
    const byId = asTextNode(figma.getNodeById(id))
    if (byId) return byId
  }
  return findByMarker(instruction.detectedFieldId)
}

function findByMarker(detectedFieldId: string): TextNode | null {
  let found: TextNode | null = null
  const visit = (node: SceneNode): void => {
    if (found) return
    if (isTextNode(node) && node.getPluginData(QF_ID_KEY) === detectedFieldId) {
      found = node
      return
    }
    const children = (node as { children?: readonly SceneNode[] }).children
    if (children) for (const child of children) visit(child)
  }
  for (const root of figma.currentPage.children) visit(root)
  return found
}

function fillResult(
  detectedFieldId: string,
  status: FillResult['status'],
  extra?: { acceptedValue?: string | null; reason?: string },
): FillResult {
  return { detectedFieldId, status, ...extra }
}

/** Snapshot a node's prior text BEFORE writing, enough to restore it on undo. */
function captureNode(instruction: FillInstruction, node: TextNode): UndoEntry {
  return {
    detectedFieldId: instruction.detectedFieldId,
    selectorCandidates: instruction.selectorCandidates,
    frame: 'main',
    shadow: false,
    inputType: 'text',
    previousValue: node.characters,
  }
}

/**
 * Apply fill instructions to Figma text nodes (mirror of `form-scanner/applyFill`).
 * Captures prior text for undo, loads fonts, writes `node.characters`. Never throws
 * per field; only ever returns `success | skipped | failed` (no `assisted` — Figma
 * has no autocomplete realm). Non-`nativeInput` strategies are skipped (no Figma
 * equivalent for v1).
 */
export async function applyFigmaFill(instructions: FillInstruction[]): Promise<FigmaFillOutcome> {
  const results: FillResult[] = []
  const entries: UndoEntry[] = []
  const claimed = new Set<string>()

  for (const instruction of instructions) {
    const { detectedFieldId, proposedValue, fillStrategy } = instruction

    if (proposedValue.trim() === '') {
      results.push(
        fillResult(detectedFieldId, 'skipped', {
          reason: 'Nothing to fill — no value was proposed.',
        }),
      )
      continue
    }
    if (fillStrategy !== 'nativeInput') {
      results.push(
        fillResult(detectedFieldId, 'skipped', {
          reason: `Strategy '${fillStrategy}' is not supported in Figma.`,
        }),
      )
      continue
    }
    const node = findNode(instruction)
    if (!node) {
      results.push(fillResult(detectedFieldId, 'failed', { reason: 'Target node not found.' }))
      continue
    }
    if (claimed.has(node.id)) {
      results.push(
        fillResult(detectedFieldId, 'skipped', { reason: 'Node already filled in this batch.' }),
      )
      continue
    }
    if (node.locked) {
      results.push(fillResult(detectedFieldId, 'skipped', { reason: 'Node is locked.' }))
      continue
    }

    const fonts = await ensureFontsLoaded(node)
    if (fonts.status === 'missing') {
      results.push(
        fillResult(detectedFieldId, 'skipped', {
          reason: `Missing font(s): ${fonts.fonts.map((f) => `${f.family} ${f.style}`).join(', ')}`,
        }),
      )
      continue
    }
    if (fonts.status === 'mixedUnhandled') {
      results.push(
        fillResult(detectedFieldId, 'skipped', {
          reason: 'Node uses mixed fonts; skipped to preserve styling.',
        }),
      )
      continue
    }

    const undo = captureNode(instruction, node)
    try {
      node.characters = proposedValue
    } catch (error) {
      results.push(
        fillResult(detectedFieldId, 'failed', {
          reason: `Write failed: ${(error as Error).message}`,
        }),
      )
      continue
    }
    claimed.add(node.id)
    entries.push(undo)
    results.push(fillResult(detectedFieldId, 'success', { acceptedValue: node.characters }))
  }

  return { results, undoSnapshot: { entries, capturedAt: new Date().toISOString() } }
}

/** Restore a captured snapshot (mirror of `form-scanner/applyUndo`). */
export async function applyFigmaUndo(snapshot: UndoSnapshot): Promise<FillResult[]> {
  const results: FillResult[] = []
  for (const entry of snapshot.entries) {
    const id = entry.selectorCandidates[0]
    const node = id ? asTextNode(figma.getNodeById(id)) : null
    if (!node) {
      results.push(
        fillResult(entry.detectedFieldId, 'failed', { reason: 'Target node not found.' }),
      )
      continue
    }
    const fonts = await ensureFontsLoaded(node)
    if (fonts.status !== 'ready') {
      results.push(
        fillResult(entry.detectedFieldId, 'skipped', { reason: 'Font not loadable for undo.' }),
      )
      continue
    }
    try {
      node.characters = entry.previousValue ?? ''
    } catch (error) {
      results.push(
        fillResult(entry.detectedFieldId, 'failed', {
          reason: `Undo failed: ${(error as Error).message}`,
        }),
      )
      continue
    }
    results.push(fillResult(entry.detectedFieldId, 'success', { acceptedValue: node.characters }))
  }
  return results
}
