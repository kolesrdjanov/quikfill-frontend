import { describe, expect, it } from 'vitest'
import {
  calendarFormat,
  calendarMonthYear,
  formatCalendarDate,
  parseCalendarDate,
} from './calendar-date'
describe('localized calendar dates', () => {
  it.each(['June 2032', 'Jun 2032', 'jun 2032', 'јун 2032', '06/2032'])(
    'reads the month from %s',
    (text) => {
      expect(calendarMonthYear(text)).toEqual({ year: 2032, month: 5 })
    },
  )
  it('keeps day/month interpretation explicit and validates full calendar dates', () => {
    expect(parseCalendarDate('05/06/2032', 'DD/MM/YYYY')).toEqual({ year: 2032, month: 5, day: 5 })
    expect(parseCalendarDate('05/06/2032', 'MM/DD/YYYY')).toEqual({ year: 2032, month: 4, day: 6 })
    expect(parseCalendarDate('31/02/2032', 'DD/MM/YYYY')).toBeNull()
    expect(parseCalendarDate('2032-06-05garbage')).toBeNull()
    expect(parseCalendarDate('Choose Tuesday, June 1st, 2032')).toEqual({
      year: 2032,
      month: 5,
      day: 1,
    })
  })
  it('uses field format before document locale', () => {
    expect(calendarFormat('MM/DD/YYYY', 'sr-RS')).toBe('MM/DD/YYYY')
    expect(calendarFormat('DD.MM.YYYY', 'en-US')).toBe('DD.MM.YYYY')
    expect(formatCalendarDate({ year: 2032, month: 5, day: 5 }, 'DD.MM.YYYY')).toBe('05.06.2032')
  })
})
