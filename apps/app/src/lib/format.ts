/** Format an ISO timestamp as a short, locale-aware date-time, or em dash. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

/** Format an ISO timestamp as a relative time like "2h ago", falling back to a date. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = date.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute')
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour')
  if (abs < 7 * day) return rtf.format(Math.round(diffMs / day), 'day')
  return formatDateTime(iso)
}

/** Format USD cents (possibly fractional) as a dollar string, e.g. `$12.00`, `$0.0180`. */
export function formatUsdCents(cents?: number | null): string {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return '—'
  const dollars = cents / 100
  // Sub-cent estimates need extra precision; whole amounts use 2 decimals.
  const fractionDigits = Math.abs(dollars) > 0 && Math.abs(dollars) < 0.01 ? 4 : 2
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  }).format(dollars)
}

/** Compact, locale-grouped integer, e.g. `1,234` / `2.0M`. */
export function formatCompactNumber(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

/** Whole-percent string or em dash, e.g. `24%`. */
export function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return `${Math.round(value)}%`
}
