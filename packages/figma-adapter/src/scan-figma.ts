import { detectedFieldSchema, scanOptionsSchema } from '@quikfill/schemas'
import type { DetectedField, FigmaSelectionScope, ScanOptions, ScanResult } from '@quikfill/schemas'
import { figmaFingerprint, figmaStructureHash } from './fingerprint-figma'

/** pluginData key holding the scanner-assigned id — a fast re-find hint for the filler. */
export const QF_ID_KEY = 'qf-id'

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === 'TEXT'
}
function childrenOf(node: SceneNode): readonly SceneNode[] | undefined {
  const children = (node as { children?: readonly SceneNode[] }).children
  return Array.isArray(children) ? children : undefined
}

/**
 * Walk the Figma node tree (mirror of `form-scanner/scanForms`) and produce a
 * `ScanResult` whose `fields` are `DetectedField[]` — the SAME shape the iframe
 * feeds to `buildPreviewPlan`. Does NOT classify or plan.
 */
export function scanFigma(
  scope: FigmaSelectionScope = 'selection',
  options?: ScanOptions,
): ScanResult {
  const opts = scanOptionsSchema.parse(options ?? {})
  const roots = scope === 'page' ? figma.currentPage.children : figma.currentPage.selection
  const fields: DetectedField[] = []
  const counter = { n: 0 }
  for (const root of roots) walk(root, [], fields, counter, opts)
  return { fields, limitations: [], structureHash: figmaStructureHash(fields) }
}

function walk(
  node: SceneNode,
  framePath: string[],
  fields: DetectedField[],
  counter: { n: number },
  opts: ScanOptions,
): void {
  if (isTextNode(node) && includeNode(node, opts)) {
    fields.push(nodeToDetectedField(node, framePath, counter.n++))
  }
  const children = childrenOf(node)
  if (children) {
    const childPath = [...framePath, node.name]
    for (const child of children) walk(child, childPath, fields, counter, opts)
  }
}

/**
 * Mirror the DOM scanner's option defaults: hidden layers are dropped unless
 * `includeHidden`, and locked layers (the Figma analog of disabled/readonly) are
 * dropped unless `includeNonFillable` — so the default scan is just the fillable set.
 */
function includeNode(node: TextNode, opts: ScanOptions): boolean {
  if (!node.visible && !opts.includeHidden) return false
  if (node.locked && opts.includeNonFillable !== true) return false
  return true
}

/** Map one text node onto a `DetectedField`, synthesizing all required fields. */
export function nodeToDetectedField(
  node: TextNode,
  framePath: string[],
  index: number,
): DetectedField {
  const id = `figma-${index}-${node.id}`
  node.setPluginData(QF_ID_KEY, id)
  const characters = node.characters
  return detectedFieldSchema.parse({
    id,
    tagName: 'figma:text',
    inputType: 'text',
    domFingerprint: figmaFingerprint({ framePath, layerName: node.name, nodeKind: node.type }),
    currentValue: characters === '' ? null : characters,
    name: node.name,
    labelText: node.name,
    sectionHeading: framePath.length ? framePath[framePath.length - 1] : undefined,
    selectorCandidates: [node.id],
    disabled: node.locked,
    visible: node.visible,
  })
}

/** Clear prior-scan markers before a re-walk (mirror of form-scanner's stale-id clear). */
export function clearStaleMarkers(node: SceneNode): void {
  if (isTextNode(node)) node.setPluginData(QF_ID_KEY, '')
  const children = childrenOf(node)
  if (children) for (const child of children) clearStaleMarkers(child)
}
