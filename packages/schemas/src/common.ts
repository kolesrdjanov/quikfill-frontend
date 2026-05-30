import { z } from 'zod'

/** A v4 UUID. Clients supply UUIDs on create so backend `push` is idempotent. */
export const uuid = z.string().uuid()

/** ISO-8601 timestamp string (e.g. `2026-05-29T12:00:00.000Z`). */
export const isoDateTime = z.string().datetime()

/** Timestamp fields shared by persisted records. Optional for local-first records. */
export const timestamps = {
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
}

/**
 * A response field that is logically optional but which the backend serializes
 * as `null` when absent (NestJS emits an explicit `null`, not an omitted key)
 * — whereas `.optional()` alone accepts only `undefined` and would reject the
 * `null`, failing the whole response parse. This accepts `null`/`undefined` on
 * the wire and normalizes both to `undefined`, so the inferred output type stays
 * `T | undefined` and no consumer ever has to handle `null`.
 */
export function nullableOptional<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish().transform((value): z.output<T> | undefined => value ?? undefined)
}
