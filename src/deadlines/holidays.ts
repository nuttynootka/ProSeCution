const MS_PER_DAY = 86_400_000

function addUtcDays(date: number, days: number): number {
  return date + days * MS_PER_DAY
}

function utcDayOfWeek(date: number): number {
  return new Date(date).getUTCDay() // 0 = Sunday ... 6 = Saturday
}

export function isWeekend(date: number): boolean {
  const day = utcDayOfWeek(date)
  return day === 0 || day === 6
}

/** The nth occurrence (1-indexed) of `weekday` (0=Sun..6=Sat) in the given UTC month. */
function nthWeekdayOfMonth(year: number, monthIndex0: number, weekday: number, n: number): number {
  let date = Date.UTC(year, monthIndex0, 1)
  let count = 0
  while (true) {
    if (utcDayOfWeek(date) === weekday) {
      count += 1
      if (count === n) return date
    }
    date = addUtcDays(date, 1)
  }
}

/** The last occurrence of `weekday` (0=Sun..6=Sat) in the given UTC month. */
function lastWeekdayOfMonth(year: number, monthIndex0: number, weekday: number): number {
  let date = addUtcDays(Date.UTC(year, monthIndex0 + 1, 1), -1)
  while (utcDayOfWeek(date) !== weekday) {
    date = addUtcDays(date, -1)
  }
  return date
}

/** 5 U.S.C. § 6103: a holiday that falls on a Saturday is observed the preceding Friday; one that falls on a Sunday is observed the following Monday. */
function observedFixedHoliday(year: number, monthIndex0: number, day: number): number {
  const date = Date.UTC(year, monthIndex0, day)
  const dow = utcDayOfWeek(date)
  if (dow === 6) return addUtcDays(date, -1)
  if (dow === 0) return addUtcDays(date, 1)
  return date
}

/**
 * The 11 federal holidays (5 U.S.C. § 6103) as observed in `year`, computed from the
 * standard rules rather than a hardcoded date table — a table would silently go stale
 * every year it isn't manually extended, and the rules themselves don't change.
 *
 * State and county courts observe their own holiday calendars, which can differ from
 * (and add to) this list — see the module-level note in `engine.ts` for how that
 * limitation is handled rather than hidden.
 */
export function federalHolidays(year: number): number[] {
  return [
    observedFixedHoliday(year, 0, 1), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // Birthday of Martin Luther King, Jr. — 3rd Monday of January
    nthWeekdayOfMonth(year, 1, 1, 3), // Washington's Birthday — 3rd Monday of February
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day — last Monday of May
    observedFixedHoliday(year, 5, 19), // Juneteenth National Independence Day
    observedFixedHoliday(year, 6, 4), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day — 1st Monday of September
    nthWeekdayOfMonth(year, 9, 1, 2), // Columbus Day — 2nd Monday of October
    observedFixedHoliday(year, 10, 11), // Veterans Day
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving Day — 4th Thursday of November
    observedFixedHoliday(year, 11, 25), // Christmas Day
  ]
}

/**
 * Only New Year's Day can shift across a year boundary (a Saturday Jan 1 is observed
 * the preceding Dec 31), so checking the neighboring years' lists too catches that
 * edge case without needing special-case logic here.
 */
export function isFederalHolidayOrWeekend(date: number): boolean {
  if (isWeekend(date)) return true
  const year = new Date(date).getUTCFullYear()
  return (
    federalHolidays(year - 1).includes(date) ||
    federalHolidays(year).includes(date) ||
    federalHolidays(year + 1).includes(date)
  )
}
