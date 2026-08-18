export type ServiceMethod = 'mail' | 'personal' | 'electronic'

/**
 * `partyName` is a snapshot, captured at the moment of logging, not a live lookup
 * through `partyId` — a proof of service is a record of what was true when the
 * document was served; if the party's name is later corrected or the party record
 * itself is deleted, the certificate this produced (and the record of who was
 * served) shouldn't silently change or go blank.
 */
export interface ProofOfServiceContent {
  partyId: string
  partyName: string
  documentDescription: string
  serviceMethod: ServiceMethod
  serviceDate: number
  /** Only meaningful for `serviceMethod: 'mail'` — the address the document was mailed to, for the certificate's own text. */
  serviceAddress?: string
  /** The existing deadline this service relates to, if the user linked one — e.g. "the motion I'm proving I mailed." */
  linkedDeadlineId?: string
  /** Set only when a mail-service extension actually applied (Fed. R. Civ. P. 6(d) and its state analogues) and produced a new Deadline record. */
  extensionDeadlineId?: string
}

export interface ProofOfService extends ProofOfServiceContent {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
}

export type ProofOfServiceInput = Omit<ProofOfServiceContent, 'extensionDeadlineId'>
