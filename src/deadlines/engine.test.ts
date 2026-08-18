import { describe, expect, it } from 'vitest'
import { calculateDeadlines, hasSeededRules, SEEDED_JURISDICTIONS } from './engine'

describe('calculateDeadlines — federal', () => {
  it('computes the 21-day answer deadline with no weekend adjustment (Mar 2, 2026 -> Mar 23, 2026, both Mondays)', () => {
    const trigger = Date.UTC(2026, 2, 2) // Monday
    const [deadline] = calculateDeadlines('federal', 'service_of_summons', trigger)

    expect(deadline.dueDate).toBe(Date.UTC(2026, 2, 23)) // Monday
    expect(deadline.isWeekendAdjusted).toBe(false)
    expect(deadline.ruleCitation).toBe('Fed. R. Civ. P. 12(a)(1)(A)(i)')
    expect(deadline.title).toBe('File an answer or Rule 12 response')
  })

  it('rolls a deadline that lands on a weekend forward to the next business day (raw due date July 4, 2026, a Saturday)', () => {
    const trigger = Date.UTC(2026, 5, 13) // 21 days before July 4, 2026
    const [deadline] = calculateDeadlines('federal', 'service_of_summons', trigger)

    // July 4 (Sat) and July 5 (Sun) are both blocked; July 6 (Mon) is clear.
    expect(deadline.dueDate).toBe(Date.UTC(2026, 6, 6))
    expect(deadline.isWeekendAdjusted).toBe(true)
  })

  it('rolls a deadline that lands exactly on a weekday holiday forward past the following weekend (raw due date Dec 25, 2026, a Friday that is Christmas)', () => {
    const trigger = Date.UTC(2026, 11, 4) // 21 days before Dec 25, 2026
    const [deadline] = calculateDeadlines('federal', 'service_of_summons', trigger)

    // Dec 25 (holiday), Dec 26 (Sat), Dec 27 (Sun) are all blocked; Dec 28 (Mon) is clear.
    expect(deadline.dueDate).toBe(Date.UTC(2026, 11, 28))
    expect(deadline.isWeekendAdjusted).toBe(true)
  })

  it('normalizes a trigger timestamp with a time-of-day component to the same result as UTC midnight', () => {
    const midnight = Date.UTC(2026, 2, 2)
    const midday = midnight + 14 * 60 * 60 * 1000 // 2pm same day

    const [a] = calculateDeadlines('federal', 'service_of_summons', midnight)
    const [b] = calculateDeadlines('federal', 'service_of_summons', midday)

    expect(b.dueDate).toBe(a.dueDate)
  })

  it('excludes the trigger day itself from the count — 21 days from a Monday lands 3 full weeks later, not one day off', () => {
    const trigger = Date.UTC(2026, 2, 2)
    const [deadline] = calculateDeadlines('federal', 'service_of_summons', trigger)
    const daysElapsed = (deadline.dueDate - trigger) / (24 * 60 * 60 * 1000)
    expect(daysElapsed).toBe(21)
  })

  it('returns nothing for a trigger this jurisdiction has no rule for', () => {
    expect(calculateDeadlines('federal', 'filing_of_motion', Date.UTC(2026, 2, 2))).toEqual([])
  })
})

describe('calculateDeadlines — California', () => {
  it('computes the 30-day response deadline with no weekend adjustment (Mar 2, 2026 -> Apr 1, 2026, both weekdays)', () => {
    const trigger = Date.UTC(2026, 2, 2) // Monday
    const [deadline] = calculateDeadlines('CA', 'service_of_summons', trigger)

    expect(deadline.dueDate).toBe(Date.UTC(2026, 3, 1)) // Wednesday
    expect(deadline.isWeekendAdjusted).toBe(false)
    expect(deadline.ruleCitation).toBe('Cal. Civ. Proc. Code § 412.20(a)(3)')
  })

  it('gives California defendants 9 more days than federal defendants from the same trigger', () => {
    const trigger = Date.UTC(2026, 2, 2)
    const [federalDeadline] = calculateDeadlines('federal', 'service_of_summons', trigger)
    const [caDeadline] = calculateDeadlines('CA', 'service_of_summons', trigger)
    const diffDays = (caDeadline.dueDate - federalDeadline.dueDate) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBe(9)
  })
})

describe('unseeded jurisdictions', () => {
  it('returns no deadlines rather than guessing', () => {
    expect(calculateDeadlines('TX', 'service_of_summons', Date.UTC(2026, 2, 2))).toEqual([])
  })

  it('hasSeededRules distinguishes "no rule for this trigger" from "no rules for this jurisdiction at all"', () => {
    expect(hasSeededRules('federal')).toBe(true)
    expect(hasSeededRules('CA')).toBe(true)
    expect(hasSeededRules('TX')).toBe(false)
  })

  it('SEEDED_JURISDICTIONS lists exactly the jurisdictions with real rules', () => {
    expect([...SEEDED_JURISDICTIONS].sort()).toEqual(['CA', 'federal'])
  })
})
