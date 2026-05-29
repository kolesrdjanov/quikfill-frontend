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
