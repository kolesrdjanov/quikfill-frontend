import { z } from 'zod'

/**
 * Which Figma nodes a scan covers — the Figma analog of the web scanner's
 * ScanScope. `selection` walks `figma.currentPage.selection`; `page` walks the
 * whole current page. This crosses the sandbox↔iframe bridge, so it is a schema
 * (parse untrusted bridge input) rather than a bare TS union.
 */
export const figmaSelectionScopeSchema = z.enum(['selection', 'page'])
export type FigmaSelectionScope = z.infer<typeof figmaSelectionScopeSchema>
