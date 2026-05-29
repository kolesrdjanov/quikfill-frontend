import { z } from 'zod'
import { detectedFieldSchema } from './detected-field'

/** Which container the user wants scanned. 'auto' picks the best (dialog → form → page). */
export const scanScopeSchema = z.enum(['auto', 'form', 'dialog', 'page'])
export type ScanScope = z.infer<typeof scanScopeSchema>

/** Options controlling a page scan. */
export const scanOptionsSchema = z.object({
  /** Include fields that are present but not visible. Default false. */
  includeHidden: z.boolean().default(false),
  /**
   * Include fields the user cannot act on — `disabled` or `readonly`. Omitted /
   * false: such fields are never fillable, so surfacing them only adds noise
   * (e.g. site-computed City/State/Zip). Set true if a caller genuinely needs
   * to inspect them.
   */
  includeNonFillable: z.boolean().optional(),
  /** Which container to scan. Treated as 'auto' when omitted. */
  scope: scanScopeSchema.optional(),
})
export type ScanOptions = z.infer<typeof scanOptionsSchema>

/** The kind of container a scan actually resolved to. */
export const scanScopeKindSchema = z.enum(['page', 'form', 'dialog', 'drawer'])
export type ScanScopeKind = z.infer<typeof scanScopeKindSchema>

/** Which container the scan used, surfaced in the UI for the scope switcher. */
export const scopeDescriptorSchema = z.object({
  kind: scanScopeKindSchema,
  /** Human label for the chip, e.g. "Add Unit dialog" or "Whole page". */
  label: z.string(),
  /** Fillable fields found inside that container. */
  fieldCount: z.number().int().nonnegative(),
  /** Echo of the requested scope so the UI knows what 'auto' resolved to. */
  requested: scanScopeSchema,
})
export type ScopeDescriptor = z.infer<typeof scopeDescriptorSchema>

/** Why some part of the page could not be scanned. Surfaced honestly in the UI. */
export const scanLimitationSchema = z.object({
  kind: z.enum(['closedShadow', 'crossOriginFrame', 'inaccessible']),
  detail: z.string(),
})
export type ScanLimitation = z.infer<typeof scanLimitationSchema>

/** The result of scanning a page: detected fields plus honest limitations. */
export const scanResultSchema = z.object({
  fields: z.array(detectedFieldSchema),
  limitations: z.array(scanLimitationSchema).default([]),
  /** Stable hash over the form's field structure (order + types + labels). */
  structureHash: z.string().optional(),
  /** Which container was scanned. Optional for backward compatibility. */
  scope: scopeDescriptorSchema.optional(),
})
export type ScanResult = z.infer<typeof scanResultSchema>
