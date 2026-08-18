import { describe, expect, it } from 'vitest'
import { federalHolidays, isFederalHolidayOrWeekend, isWeekend } from './holidays'

describe('federalHolidays', () => {
  it('shifts a Saturday New Year\'s Day to the preceding Friday (Jan 1, 2022 was a Saturday)', () => {
    expect(new Date(Date.UTC(2022, 0, 1)).getUTCDay()).toBe(6)
    const holidays = federalHolidays(2022)
    expect(holidays).toContain(Date.UTC(2021, 11, 31))
    expect(holidays).not.toContain(Date.UTC(2022, 0, 1))
  })

  it('shifts a Sunday Juneteenth to the following Monday (June 19, 2022 was a Sunday)', () => {
    expect(new Date(Date.UTC(2022, 5, 19)).getUTCDay()).toBe(0)
    expect(federalHolidays(2022)).toContain(Date.UTC(2022, 5, 20))
  })

  it('shifts a Saturday Independence Day to the preceding Friday (July 4, 2026 was a Saturday)', () => {
    expect(new Date(Date.UTC(2026, 6, 4)).getUTCDay()).toBe(6)
    const holidays = federalHolidays(2026)
    expect(holidays).toContain(Date.UTC(2026, 6, 3))
    expect(holidays).not.toContain(Date.UTC(2026, 6, 4))
  })

  it('does not shift a weekday holiday (July 4, 2023 was a Tuesday)', () => {
    expect(new Date(Date.UTC(2023, 6, 4)).getUTCDay()).toBe(2)
    expect(federalHolidays(2023)).toContain(Date.UTC(2023, 6, 4))
  })

  it('shifts a Saturday Veterans Day to the preceding Friday (Nov 11, 2028 was a Saturday)', () => {
    expect(new Date(Date.UTC(2028, 10, 11)).getUTCDay()).toBe(6)
    expect(federalHolidays(2028)).toContain(Date.UTC(2028, 10, 10))
  })

  it('computes Thanksgiving as the 4th Thursday of November (Nov 28, 2024)', () => {
    expect(new Date(Date.UTC(2024, 10, 28)).getUTCDay()).toBe(4)
    const holidays = federalHolidays(2024)
    expect(holidays).toContain(Date.UTC(2024, 10, 28))
    // Not the 3rd (21st) or 5th (there is no 5th) Thursday.
    expect(holidays).not.toContain(Date.UTC(2024, 10, 21))
  })

  it('computes Memorial Day as the last Monday of May (May 26, 2025)', () => {
    expect(new Date(Date.UTC(2025, 4, 26)).getUTCDay()).toBe(1)
    const holidays = federalHolidays(2025)
    expect(holidays).toContain(Date.UTC(2025, 4, 26))
    // June 2 is the next Monday — not Memorial Day.
    expect(holidays).not.toContain(Date.UTC(2025, 5, 2))
  })

  it('returns exactly 11 holidays for a year', () => {
    expect(federalHolidays(2026)).toHaveLength(11)
  })

  it('never places an observed holiday on a Saturday or Sunday, across a range of years', () => {
    for (const year of [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
      for (const h of federalHolidays(year)) {
        const dow = new Date(h).getUTCDay()
        expect(dow).not.toBe(0)
        expect(dow).not.toBe(6)
      }
    }
  })
})

describe('isWeekend', () => {
  it('is true for Saturday and Sunday', () => {
    expect(isWeekend(Date.UTC(2026, 6, 4))).toBe(true) // Saturday
    expect(isWeekend(Date.UTC(2026, 6, 5))).toBe(true) // Sunday
  })

  it('is false for a weekday', () => {
    expect(isWeekend(Date.UTC(2026, 6, 6))).toBe(false) // Monday
  })
})

describe('isFederalHolidayOrWeekend', () => {
  it('is true for the actual holiday date even when the observed date differs (July 4, 2026, a Saturday)', () => {
    expect(isFederalHolidayOrWeekend(Date.UTC(2026, 6, 4))).toBe(true)
  })

  it('is true for the observed date (July 3, 2026, the Friday July 4 shifts to)', () => {
    expect(isFederalHolidayOrWeekend(Date.UTC(2026, 6, 3))).toBe(true)
  })

  it('is true across the year boundary for New Year\'s Day observed on Dec 31 of the prior year', () => {
    expect(isFederalHolidayOrWeekend(Date.UTC(2021, 11, 31))).toBe(true)
  })

  it('is false for an ordinary weekday', () => {
    expect(isFederalHolidayOrWeekend(Date.UTC(2026, 6, 6))).toBe(false) // Monday, not a holiday
  })
})
