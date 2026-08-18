import type { Deadline } from './types'

const MS_PER_DAY = 86_400_000

export interface DeadlineReminderSummary {
  /** Pending deadlines whose due date has already passed, most-recently-due first (least overdue first). */
  overdue: Deadline[]
  /** Pending deadlines due within the window but not yet overdue, soonest first. */
  dueSoon: Deadline[]
}

/**
 * Splits a case's deadlines into overdue and due-soon buckets relative to `now`.
 * Completed deadlines are excluded entirely — one the user already dealt with
 * shouldn't keep surfacing as urgent just because its date has passed. This is the
 * "in-app reminders" half of Chunk 15's scope: whenever the app is open, it can
 * compute and show this immediately from local data, no server involved.
 *
 * The other half of the plan's "Web Push + in-app reminders" — a notification that
 * arrives while the app is *closed* — needs something to push to a device that
 * isn't running, which is not achievable without a server. That's a real capability
 * gap, not a shortcut: see `src/notifications/notifications.ts` for where that
 * limitation is called out directly rather than papered over with a toggle that
 * would silently do nothing.
 */
export function summarizeDeadlineReminders(
  deadlines: Deadline[],
  now: number,
  dueSoonWindowDays = 14,
): DeadlineReminderSummary {
  const windowEnd = now + dueSoonWindowDays * MS_PER_DAY
  const pending = deadlines.filter((d) => d.status === 'pending')

  const overdue = pending.filter((d) => d.dueDate < now).sort((a, b) => b.dueDate - a.dueDate)
  const dueSoon = pending
    .filter((d) => d.dueDate >= now && d.dueDate <= windowEnd)
    .sort((a, b) => a.dueDate - b.dueDate)

  return { overdue, dueSoon }
}

/** A compact count for a "N deadlines need attention" style stat — overdue deadlines count too, since passing the original date doesn't make one any less something to attend to. */
export function countDeadlinesNeedingAttention(deadlines: Deadline[], now: number, dueSoonWindowDays = 14): number {
  const { overdue, dueSoon } = summarizeDeadlineReminders(deadlines, now, dueSoonWindowDays)
  return overdue.length + dueSoon.length
}
