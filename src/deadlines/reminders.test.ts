import { describe, expect, it } from 'vitest'
import { countDeadlinesNeedingAttention, summarizeDeadlineReminders } from './reminders'
import type { Deadline } from './types'

const NOW = Date.UTC(2026, 5, 15) // June 15, 2026
const DAY = 86_400_000

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: 'd1',
    caseId: 'c1',
    createdAt: NOW,
    updatedAt: NOW,
    title: 'File an answer',
    description: 'desc',
    dueDate: NOW + DAY,
    ruleCitation: 'Fed. R. Civ. P. 12(a)(1)(A)(i)',
    isWeekendAdjusted: false,
    trigger: 'service_of_summons',
    triggerDate: NOW,
    status: 'pending',
    ...overrides,
  }
}

describe('summarizeDeadlineReminders', () => {
  it('puts a past-due pending deadline in overdue', () => {
    const d = makeDeadline({ dueDate: NOW - DAY })
    const { overdue, dueSoon } = summarizeDeadlineReminders([d], NOW)
    expect(overdue).toEqual([d])
    expect(dueSoon).toEqual([])
  })

  it('puts a deadline due today in dueSoon, not overdue', () => {
    const d = makeDeadline({ dueDate: NOW })
    const { overdue, dueSoon } = summarizeDeadlineReminders([d], NOW)
    expect(overdue).toEqual([])
    expect(dueSoon).toEqual([d])
  })

  it('puts a deadline within the window in dueSoon', () => {
    const d = makeDeadline({ dueDate: NOW + 10 * DAY })
    const { dueSoon } = summarizeDeadlineReminders([d], NOW, 14)
    expect(dueSoon).toEqual([d])
  })

  it('excludes a deadline right at the window boundary\'s edge (included) and just past it (excluded)', () => {
    const atBoundary = makeDeadline({ id: 'at', dueDate: NOW + 14 * DAY })
    const pastBoundary = makeDeadline({ id: 'past', dueDate: NOW + 15 * DAY })
    const { dueSoon } = summarizeDeadlineReminders([atBoundary, pastBoundary], NOW, 14)
    expect(dueSoon.map((d) => d.id)).toEqual(['at'])
  })

  it('excludes a completed deadline entirely, even if overdue', () => {
    const d = makeDeadline({ dueDate: NOW - DAY, status: 'completed' })
    const { overdue, dueSoon } = summarizeDeadlineReminders([d], NOW)
    expect(overdue).toEqual([])
    expect(dueSoon).toEqual([])
  })

  it('sorts overdue deadlines least-overdue first', () => {
    const longOverdue = makeDeadline({ id: 'a', dueDate: NOW - 10 * DAY })
    const justOverdue = makeDeadline({ id: 'b', dueDate: NOW - DAY })
    const { overdue } = summarizeDeadlineReminders([longOverdue, justOverdue], NOW)
    expect(overdue.map((d) => d.id)).toEqual(['b', 'a'])
  })

  it('sorts dueSoon deadlines soonest first', () => {
    const later = makeDeadline({ id: 'a', dueDate: NOW + 10 * DAY })
    const sooner = makeDeadline({ id: 'b', dueDate: NOW + DAY })
    const { dueSoon } = summarizeDeadlineReminders([later, sooner], NOW)
    expect(dueSoon.map((d) => d.id)).toEqual(['b', 'a'])
  })

  it('returns empty buckets for no deadlines', () => {
    expect(summarizeDeadlineReminders([], NOW)).toEqual({ overdue: [], dueSoon: [] })
  })
})

describe('countDeadlinesNeedingAttention', () => {
  it('counts both overdue and dueSoon together', () => {
    const overdue = makeDeadline({ id: 'a', dueDate: NOW - DAY })
    const soon = makeDeadline({ id: 'b', dueDate: NOW + DAY })
    const tooFarOut = makeDeadline({ id: 'c', dueDate: NOW + 30 * DAY })
    expect(countDeadlinesNeedingAttention([overdue, soon, tooFarOut], NOW)).toBe(2)
  })

  it('is 0 when there are no pending deadlines', () => {
    expect(countDeadlinesNeedingAttention([], NOW)).toBe(0)
  })
})
