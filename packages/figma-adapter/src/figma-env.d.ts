/**
 * Minimal ambient typings for the subset of the Figma Plugin API this adapter
 * uses. The sandbox realm has no DOM, so this package compiles with
 * `lib: ["ES2023"]` (no DOM/Iterable) and declares the `figma` global here.
 *
 * Production should swap this file for the `@figma/plugin-typings` devDependency
 * (delete this file, add `"types": ["@figma/plugin-typings"]` to tsconfig). It is
 * kept local so the package type-checks and unit-tests **headless** — against a
 * stubbed `figma` global — without a network install.
 */

export {}

declare global {
  interface FontName {
    readonly family: string
    readonly style: string
  }

  interface BaseNode {
    readonly id: string
    name: string
    setPluginData(key: string, value: string): void
    getPluginData(key: string): string
  }

  interface SceneNodeBase extends BaseNode {
    readonly type: string
    visible: boolean
    locked: boolean
    readonly parent: BaseNode | null
    readonly children?: ReadonlyArray<SceneNode>
  }

  interface TextNode extends BaseNode {
    readonly type: 'TEXT'
    visible: boolean
    locked: boolean
    readonly parent: BaseNode | null
    characters: string
    fontName: FontName | symbol
    getRangeAllFontNames(start: number, end: number): FontName[]
    getRangeFontName(start: number, end: number): FontName | symbol
    insertCharacters(index: number, characters: string): void
    deleteCharacters(start: number, end: number): void
  }

  type SceneNode = TextNode | SceneNodeBase

  interface PageNode extends BaseNode {
    readonly children: ReadonlyArray<SceneNode>
    selection: ReadonlyArray<SceneNode>
  }

  interface ClientStorageAPI {
    getAsync(key: string): Promise<unknown>
    setAsync(key: string, value: unknown): Promise<void>
    deleteAsync(key: string): Promise<void>
    keysAsync(): Promise<string[]>
  }

  interface UIAPI {
    postMessage(pluginMessage: unknown): void
    onmessage: ((pluginMessage: unknown) => void) | null
  }

  interface PluginAPI {
    readonly mixed: symbol
    readonly currentPage: PageNode
    getNodeById(id: string): BaseNode | null
    loadFontAsync(fontName: FontName): Promise<void>
    showUI(html: string, options?: { width?: number; height?: number; visible?: boolean }): void
    readonly ui: UIAPI
    readonly clientStorage: ClientStorageAPI
  }

  var figma: PluginAPI
}
