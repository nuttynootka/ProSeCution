import { describe, expect, it } from 'vitest'
import { daysUntil, formatDeadlineUrgency, urgencyTone } from './urgency'

const NOW = Date.UTC(2026, 5, 15)
const DAY = 86_400_000

describe('daysUntil', () => {
  it('is 0 for a due date later the same day', () => {
    expect(daysUntil(NOW + 6 * 60 * 60 * 1000, NOW)).toBe(0)
  })

  it('is positive for a future date', () => {
    expect(daysUntil(NOW + 5 * DAY, NOW)).toBe(5)
  })

  it('is negative for a past date', () => {
    expect(daysUntil(NOW - 5 * DAY, NOW)).toBe(-5)
  })
})

describe('formatDeadlineUrgency', () => {
  it('reads TODAY for a due date today', () => {
    expect(formatDeadlineUrgency(NOW, NOW)).toBe('TODAY')
  })

  it('reads TOMORROW for one day out', () => {
    expect(formatDeadlineUrgency(NOW + DAY, NOW)).toBe('TOMORROW')
  })

  it('reads "IN N DAYS" for further out', () => {
    expect(formatDeadlineUrgency(NOW + 5 * DAY, NOW)).toBe('IN 5 DAYS')
  })

  it('reads singular OVERDUE for one day overdue', () => {
    expect(formatDeadlineUrgency(NOW - DAY, NOW)).toBe('OVERDUE · 1 DAY')
  })

  it('reads plural OVERDUE for multiple days overdue', () => {
    expect(formatDeadlineUrgency(NOW - 5 * DAY, NOW)).toBe('OVERDUE · 5 DAYS')
  })
})

describe('urgencyTone', () => {
  it('is overdue for a past due date', () => {
    expect(urgencyTone(NOW - DAY, NOW)).toBe('overdue')
  })

  it('is soon for today through 3 days out', () => {
    expect(urgencyTone(NOW, NOW)).toBe('soon')
    expect(urgencyTone(NOW + 3 * DAY, NOW)).toBe('soon')
  })

  it('is normal beyond 3 days out', () => {
    expect(urgencyTone(NOW + 4 * DAY, NOW)).toBe('normal')
  })
})
