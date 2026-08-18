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
  /**
   * Set together, only by Chunk 23's proof-of-service flow: `relatedDeadlineId`
   * points at the original deadline this one extends (mirrors the blueprint's
   * `related_service_deadline_id`/`is_service_deadline` columns), so a caller can
   * explain *why* a second deadline exists for what's really the same underlying
   * obligation, instead of two unrelated-looking entries on the same timeline.
   */
  isServiceDeadline?: boolean
  relatedDeadlineId?: string
}

export interface Deadline extends DeadlineContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}
