import { db, vault } from '../vault'
import { DeadlineRepository } from './DeadlineRepository'

export { calculateDeadlines, hasSeededRules, SEEDED_JURISDICTIONS } from './engine'
export type { CalculatedDeadline, TriggerEvent } from './engine'
export { federalHolidays, isFederalHolidayOrWeekend, isWeekend } from './holidays'
export { DeadlineNotFoundError, DeadlineRepository } from './DeadlineRepository'
export type { Deadline, DeadlineContent, DeadlineStatus } from './types'
export { buildIcsCalendar, icsFilename, triggerIcsDownload } from './ics'
export { countDeadlinesNeedingAttention, summarizeDeadlineReminders } from './reminders'
export type { DeadlineReminderSummary } from './reminders'

/** App-wide repository instance, wired to the app's real database and vault. */
export const deadlineRepository = new DeadlineRepository(db, vault)
