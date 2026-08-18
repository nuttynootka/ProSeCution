import { db, vault } from '../vault'
import { CaseRepository } from './CaseRepository'
import { PartyRepository } from './PartyRepository'

/** App-wide repository instances, wired to the app's real database and vault. */
export const caseRepository = new CaseRepository(db, vault)
export const partyRepository = new PartyRepository(db, vault)

export { CaseRepository, CaseNotFoundError } from './CaseRepository'
export { PartyRepository, PartyNotFoundError } from './PartyRepository'
export { formatJurisdiction } from './jurisdiction'
export { LITIGATION_STAGES } from './types'
export type { Case, CaseContent, CaseInput, LitigationStage, Party, PartyContent, PartyRole } from './types'
