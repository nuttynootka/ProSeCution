/**
 * Every stage a case can be in, in procedural order. Chunk 6 needs this now for the
 * dashboard's stage bar; real stage *detection* (moving a case forward based on what
 * actually happened) is Chunk 49. Until then every case starts, and stays, at
 * 'pleadings' unless something manually moves it.
 */
export const LITIGATION_STAGES = ['pleadings', 'discovery', 'motions', 'trial'] as const
export type LitigationStage = (typeof LITIGATION_STAGES)[number]

/**
 * Deliberately not the blueprint's full `cases` column list (case_number,
 * court_name, judge_name, ...) — those have no producer yet, and the whole-blob
 * encryption scheme means adding them later costs nothing beyond adding the field.
 * Scoped to what exists today, not what might exist eventually.
 */
export interface CaseContent {
  state: string
  county: string
  caseType: string
  currentStage: LitigationStage
}

/**
 * What CaseRepository.create() actually takes: everything the wizard captures.
 * currentStage isn't caller-supplied — every case starts at 'pleadings', the same
 * way `id`/`createdAt` are repository-assigned, not passed in.
 */
export type CaseInput = Omit<CaseContent, 'currentStage'>

export interface Case extends CaseContent {
  id: string
  createdAt: number
  updatedAt: number
}

export type PartyRole = 'plaintiff' | 'defendant' | 'third_party'

export interface PartyContent {
  name: string
  role: PartyRole
}

export interface Party extends PartyContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}
