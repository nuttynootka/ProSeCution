/**
 * The fields the New Case Wizard (Chunk 5) actually captures. Deliberately not the
 * blueprint's full `cases` column list (case_number, court_name, judge_name,
 * current_stage, ...) — those have no producer yet, and the whole-blob encryption
 * scheme means adding them later costs nothing beyond adding the field. Scoped to
 * what exists today, not what might exist eventually.
 */
export interface CaseContent {
  state: string
  county: string
  caseType: string
}

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
