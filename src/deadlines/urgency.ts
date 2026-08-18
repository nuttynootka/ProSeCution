const MS_PER_DAY = 86_400_000

/** Whole days between `now` and `dueDate` — negative once the due date has passed. Rounds toward the due date so "11:59pm today" and "12:01am today" both read as 0 days, not one drifting to -1/1. */
export function daysUntil(dueDate: number, now: number): number {
  return Math.round((dueDate - now) / MS_PER_DAY)
}

/** A short label matching the mockup's `d.in` field ("IN 5 DAYS", "TODAY", "OVERDUE"). */
export function formatDeadlineUrgency(dueDate: number, now: number): string {
  const days = daysUntil(dueDate, now)
  if (days < 0) return days === -1 ? 'OVERDUE · 1 DAY' : `OVERDUE · ${-days} DAYS`
  if (days === 0) return 'TODAY'
  if (days === 1) return 'TOMORROW'
  return `IN ${days} DAYS`
}

export type UrgencyTone = 'overdue' | 'soon' | 'normal'

/** Color-coding tier for a deadline's dot/badge — overdue is unambiguous; "soon" (3 days or less) gets a warmer tone than a deadline weeks out, matching the same red/amber/default vocabulary already used for OCR confidence badges. */
export function urgencyTone(dueDate: number, now: number): UrgencyTone {
  const days = daysUntil(dueDate, now)
  if (days < 0) return 'overdue'
  if (days <= 3) return 'soon'
  return 'normal'
}
