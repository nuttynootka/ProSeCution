/**
 * Every stage a case can be in, in procedural order. Chunk 6 needs this now for the
 * dashboard's stage bar; real stage *detection* (moving a case forward based on what
 * actually happened) is Chunk 49. Until then every case starts, and stays, at
 * 'pleadings' unless something manually moves it.
 */
export const LITIGATION_STAGES = ['pleadings', 'discovery', 'motions', 'trial'] as const
export type LitigationStage = (typeof LITIGATION_STAGES)[number]

/**
 * Deliberately not the blueprint's full `cases` column list (court_name,
 * judge_name, ...) — those have no producer yet, and the whole-blob encryption
 * scheme means adding them later costs nothing beyond adding the field. Scoped to
 * what exists today, not what might exist eventually.
 *
 * `caseNumber` is optional, not part of the wizard's captured fields (CaseInput) —
 * nothing asks for it at creation. Its producer is Chunk 10's document review
 * screen: extracted from a scanned document and, once confirmed, written back here.
 * It lives on the case (one case, one number, shared by every document in it), not
 * on the document that happened to reveal it.
 */
export interface CaseContent {
  state: string
  county: string
  caseType: string
  currentStage: LitigationStage
  caseNumber?: string
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
