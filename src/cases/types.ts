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
/**
 * Mirrors `FeeWaiverEligibility` from `../feeWaiver/engine` exactly, but is not
 * imported from there — `cases` is a foundational module every feature depends on
 * (deadlines, pdf, service, feeWaiver itself), and nothing else in this file
 * depends the other way. Duplicating this one small literal union here keeps that
 * dependency direction intact instead of introducing the first exception to it.
 */
export type FeeWaiverStatus = 'eligible' | 'not_eligible' | 'undetermined'

export interface CaseContent {
  /** A 2-letter state code, or the literal 'federal' — the wizard's jurisdiction chip picker (Chunk 5/16) offers both, and this is also the exact key the deadline engine (Chunk 12) looks its rules up by. Display it through `formatJurisdiction`, not raw, so 'federal' doesn't show up lowercase next to uppercase state codes. */
  state: string
  county: string
  caseType: string
  currentStage: LitigationStage
  caseNumber?: string
  /**
   * The wizard's Fee Waiver step (Chunk 24) writes all four of these together, or
   * none of them. Absent means the same thing 'not_requested' would — the user
   * never ran the eligibility check for this case — kept optional/undefined rather
   * than a required field defaulted at creation (like `currentStage` is) so adding
   * it costs nothing beyond this type, the same tradeoff `caseNumber` already makes.
   * When present, `feeWaiverStatus` holds exactly what `checkFeeWaiverEligibility`
   * returned, and the other three fields hold the inputs that produced it — so the
   * result can be explained or recomputed later, not just displayed as an
   * unexplained badge.
   */
  feeWaiverStatus?: FeeWaiverStatus
  feeWaiverHouseholdSize?: number
  feeWaiverAnnualIncome?: number
  feeWaiverReceivesPublicBenefits?: boolean
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
