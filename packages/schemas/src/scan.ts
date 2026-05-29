import { z } from 'zod'
import { detectedFieldSchema } from './detected-field'

/** Options controlling a page scan. */
export const scanOptionsSchema = z.object({
  /** Include fields that are present but not visible. Default false. */
  includeHidden: z.boolean().default(false),
})
export type ScanOptions = z.infer<typeof scanOptionsSchema>

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
})
export type ScanResult = z.infer<typeof scanResultSchema>
