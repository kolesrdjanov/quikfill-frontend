/**
 * In-memory Figma stub for headless unit tests. Imported only by `*.test.ts`.
 * Builds objects shaped like the ambient `figma` globals (see figma-env.d.ts).
 */

/** The stand-in for `figma.mixed` — identity-compared by `isMixed`. */
export const MIXED: unique symbol = Symbol('figma.mixed')

export interface StubTextInit {
  id: string
  name?: string
  characters?: string
  fontName?: FontName | symbol
  /** Distinct fonts returned for a mixed-font node. */
  rangeFonts?: FontName[]
  visible?: boolean
  locked?: boolean
  children?: SceneNode[]
}

/** Build a TextNode-shaped stub with an in-memory pluginData store. */
export function makeTextNode(init: StubTextInit): TextNode {
  const pluginData = new Map<string, string>()
  const node = {
    id: init.id,
    name: init.name ?? init.id,
    type: 'TEXT' as const,
    visible: init.visible ?? true,
    locked: init.locked ?? false,
    parent: null,
    characters: init.characters ?? '',
    fontName: init.fontName ?? { family: 'Inter', style: 'Regular' },
    getRangeAllFontNames: (): FontName[] => init.rangeFonts ?? [],
    getRangeFontName: (): FontName | symbol => node.fontName,
    insertCharacters(index: number, chars: string): void {
      node.characters = node.characters.slice(0, index) + chars + node.characters.slice(index)
    },
    deleteCharacters(start: number, end: number): void {
      node.characters = node.characters.slice(0, start) + node.characters.slice(end)
    },
    setPluginData(key: string, value: string): void {
      pluginData.set(key, value)
    },
    getPluginData(key: string): string {
      return pluginData.get(key) ?? ''
    },
  }
  return node as unknown as TextNode
}

/** Build a non-text container (frame/group) stub with children. */
export function makeFrame(id: string, name: string, children: SceneNode[]): SceneNode {
  const pluginData = new Map<string, string>()
  return {
    id,
    name,
    type: 'FRAME',
    visible: true,
    locked: false,
    parent: null,
    children,
    setPluginData(key: string, value: string): void {
      pluginData.set(key, value)
    },
    getPluginData(key: string): string {
      return pluginData.get(key) ?? ''
    },
  } as unknown as SceneNode
}

export interface StubInit {
  selection?: SceneNode[]
  pageChildren?: SceneNode[]
  /** Fonts whose loadFontAsync should reject (simulating an uninstalled font). */
  missingFonts?: FontName[]
  storage?: Record<string, unknown>
}

export interface FigmaStub extends PluginAPI {
  /** Payloads captured from figma.ui.postMessage. */
  readonly sent: unknown[]
  /** Fonts that loadFontAsync was successfully called with. */
  readonly loaded: FontName[]
  readonly storageMap: Map<string, unknown>
  /** Simulate an inbound message to figma.ui.onmessage. */
  emit(pluginMessage: unknown): void
}

function collect(nodes: readonly SceneNode[], into: Map<string, SceneNode>): void {
  for (const n of nodes) {
    into.set(n.id, n)
    const children = (n as { children?: readonly SceneNode[] }).children
    if (children) collect(children, into)
  }
}

/** Build a `figma`-shaped stub. Install with `installFigma(stub)`. */
export function makeFigmaStub(init: StubInit = {}): FigmaStub {
  const selection = init.selection ?? []
  const pageChildren = init.pageChildren ?? selection
  const registry = new Map<string, SceneNode>()
  collect(pageChildren, registry)
  collect(selection, registry)

  const sent: unknown[] = []
  const loaded: FontName[] = []
  const storageMap = new Map<string, unknown>(Object.entries(init.storage ?? {}))
  const missing = new Set((init.missingFonts ?? []).map((f) => `${f.family} ${f.style}`))

  const ui: UIAPI & { onmessage: ((m: unknown) => void) | null } = {
    onmessage: null,
    postMessage(message: unknown): void {
      sent.push(message)
    },
  }

  const stub: FigmaStub = {
    mixed: MIXED,
    currentPage: {
      id: 'page-1',
      name: 'Page 1',
      children: pageChildren,
      selection,
      setPluginData(): void {},
      getPluginData(): string {
        return ''
      },
    },
    getNodeById(id: string): BaseNode | null {
      return registry.get(id) ?? null
    },
    async loadFontAsync(fontName: FontName): Promise<void> {
      if (missing.has(`${fontName.family} ${fontName.style}`)) {
        throw new Error(`Font not available: ${fontName.family} ${fontName.style}`)
      }
      loaded.push(fontName)
    },
    showUI(): void {},
    ui,
    clientStorage: {
      async getAsync(key: string): Promise<unknown> {
        return storageMap.has(key) ? storageMap.get(key) : undefined
      },
      async setAsync(key: string, value: unknown): Promise<void> {
        storageMap.set(key, value)
      },
      async deleteAsync(key: string): Promise<void> {
        storageMap.delete(key)
      },
      async keysAsync(): Promise<string[]> {
        return [...storageMap.keys()]
      },
    },
    sent,
    loaded,
    storageMap,
    emit(message: unknown): void {
      ui.onmessage?.(message)
    },
  }
  return stub
}

/** Install a stub as the global `figma`; returns a restore function. */
export function installFigma(stub: PluginAPI): () => void {
  const holder = globalThis as { figma?: PluginAPI }
  const previous = holder.figma
  holder.figma = stub
  return () => {
    if (previous) holder.figma = previous
    else delete holder.figma
  }
}
