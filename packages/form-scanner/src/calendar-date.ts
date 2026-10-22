export interface CalendarDate {
  year: number
  month: number
  day: number
}
export type CalendarFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'DD.MM.YYYY'
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
const monthFormatters = ['en-US', 'sr-Latn-RS', 'sr-Cyrl-RS'].flatMap((locale) =>
  (['long', 'short'] as const).map(
    (month) => new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' }),
  ),
)
const monthTokens = Array.from({ length: 12 }, (_, month) => [
  ...new Set(
    monthFormatters.map((formatter) =>
      normalize(formatter.format(new Date(Date.UTC(2024, month, 15)))).replace(/\.$/, ''),
    ),
  ),
])

export function calendarMonthYear(text: string | null): { year: number; month: number } | null {
  if (!text) return null
  const normalized = normalize(text)
  const year = Number(/\b(\d{4})\b/.exec(normalized)?.[1])
  if (!year) return null
  const words: string[] = normalized.match(/\p{L}+/gu) ?? []
  const month = monthTokens.findIndex((tokens) => tokens.some((t) => words.includes(t)))
  if (month >= 0) return { year, month }
  const numeric = /^(\d{1,2})\s*[/.-]\s*\d{4}$/.exec(normalized.trim())
  return numeric && +numeric[1] >= 1 && +numeric[1] <= 12 ? { year, month: +numeric[1] - 1 } : null
}

export function calendarFormat(
  placeholder?: string | null,
  locale?: string | null,
): CalendarFormat {
  const p = placeholder?.trim().toLowerCase() ?? ''
  const explicit =
    /^[dmy]{1,4}([/.\s-]+[dmy]{1,4}){2}$/.test(p) &&
    p.includes('d') &&
    p.includes('m') &&
    p.includes('y')
  if (explicit && p.startsWith('y')) return 'YYYY-MM-DD'
  if (explicit && p.startsWith('d')) return p.includes('.') ? 'DD.MM.YYYY' : 'DD/MM/YYYY'
  if (explicit && p.startsWith('m')) return 'MM/DD/YYYY'
  return locale?.toLowerCase().startsWith('sr') || locale?.toLowerCase() === 'en-gb'
    ? 'DD/MM/YYYY'
    : 'MM/DD/YYYY'
}

export function parseCalendarDate(
  value: string,
  format: CalendarFormat = 'MM/DD/YYYY',
): CalendarDate | null {
  const text = value.trim()
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (match) return valid(+match[1], +match[2] - 1, +match[3])
  match = /^(\d{1,2})\s*([/.])\s*(\d{1,2})\s*\2\s*(\d{2,4})\.?$/.exec(text)
  if (match) {
    const year = +match[4] < 100 ? 2000 + +match[4] : +match[4]
    const dayFirst = format.startsWith('DD') || match[2] === '.'
    return valid(year, +(dayFirst ? match[3] : match[1]) - 1, +(dayFirst ? match[1] : match[3]))
  }
  const named = calendarMonthYear(text)
  const day = /\b(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text)?.[1]
  return named && day ? valid(named.year, named.month, +day) : null
}

export function formatCalendarDate(date: CalendarDate, format: CalendarFormat): string {
  const m = String(date.month + 1).padStart(2, '0')
  const d = String(date.day).padStart(2, '0')
  if (format === 'YYYY-MM-DD') return `${date.year}-${m}-${d}`
  if (format === 'MM/DD/YYYY') return `${m}/${d}/${date.year}`
  const separator = format === 'DD.MM.YYYY' ? '.' : '/'
  return `${d}${separator}${m}${separator}${date.year}`
}
function valid(year: number, month: number, day: number): CalendarDate | null {
  const date = new Date(0)
  date.setUTCFullYear(year, month, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? { year, month, day }
    : null
}
