import { z } from 'zod'
import { isoDateTime, nullableOptional, uuid } from './common'

export const analyticsPeriodSchema = z.enum(['current_month', 'all_time'])
export type AnalyticsPeriod = z.infer<typeof analyticsPeriodSchema>

/** Sortable columns of the per-user table (server-side sort). */
export const analyticsSortSchema = z.enum([
  'tokens',
  'requests',
  'estCostUsdCents',
  'utilizationPercent',
  'marginUsdCents',
  'email',
  'createdAt',
])
export type AnalyticsSort = z.infer<typeof analyticsSortSchema>

export const analyticsOrderSchema = z.enum(['asc', 'desc'])
export type AnalyticsOrder = z.infer<typeof analyticsOrderSchema>

export const analyticsPaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
})
export type AnalyticsPaginationMeta = z.infer<typeof analyticsPaginationSchema>

/** Query params for `GET /admin/analytics`. */
export interface AnalyticsQueryParams {
  period: AnalyticsPeriod
  page: number
  pageSize: number
  sort?: AnalyticsSort
  order?: AnalyticsOrder
}

export const analyticsPricingSchema = z.object({
  inputUsdPerMTok: z.number(),
  outputUsdPerMTok: z.number(),
})

export const analyticsOverviewSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  totalRequests: z.number(),
  totalTokensIn: z.number(),
  totalTokensOut: z.number(),
  totalTokens: z.number(),
  estCostUsdCents: z.number(),
  monthlyRevenueUsdCents: z.number(),
  netMarginUsdCents: z.number(),
})

export const analyticsEndpointSchema = z.object({
  endpoint: z.string(),
  requests: z.number(),
  tokens: z.number(),
})

export const analyticsUserRowSchema = z.object({
  userId: uuid,
  email: z.string(),
  planKey: z.string(),
  planDisplayName: z.string(),
  planPriceUsdCents: z.number(),
  planTokenLimit: z.number(),
  requests: z.number(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  tokens: z.number(),
  estCostUsdCents: z.number(),
  utilizationPercent: nullableOptional(z.number()),
  marginUsdCents: z.number(),
  createdAt: isoDateTime,
})

/** Admin analytics report (mirrors backend `AnalyticsResponseDto`). */
export const analyticsResponseSchema = z.object({
  period: analyticsPeriodSchema,
  periodStart: nullableOptional(isoDateTime),
  periodEnd: isoDateTime,
  generatedAt: isoDateTime,
  model: z.string(),
  pricing: analyticsPricingSchema,
  overview: analyticsOverviewSchema,
  byEndpoint: z.array(analyticsEndpointSchema),
  pagination: analyticsPaginationSchema,
  users: z.array(analyticsUserRowSchema),
})

export type AnalyticsPricing = z.infer<typeof analyticsPricingSchema>
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>
export type AnalyticsEndpoint = z.infer<typeof analyticsEndpointSchema>
export type AnalyticsUserRow = z.infer<typeof analyticsUserRowSchema>
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>
