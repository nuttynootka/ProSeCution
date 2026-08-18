import type { TriggerEvent } from './engine'

export type DeadlineStatus = 'pending' | 'completed'

/**
 * What the calculation engine produces (title, description, dueDate, ruleCitation,
 * isWeekendAdjusted) plus what it doesn't know about: which trigger/date produced
 * it, and whether the user has since dealt with it. `trigger`/`triggerDate` are kept
 * rather than discarded so a deadline can be explained later ("21 days from being
 * served on March 2") without re-deriving it.
 */
export interface DeadlineContent {
  title: string
  description: string
  dueDate: number
  ruleCitation: string
  isWeekendAdjusted: boolean
  trigger: TriggerEvent
  triggerDate: number
  status: DeadlineStatus
}

export interface Deadline extends DeadlineContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}
