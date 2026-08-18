import { caseRepository } from '../cases'
import { deadlineRepository } from '../deadlines'
import { db, vault } from '../vault'
import { ProofOfServiceRepository } from './ProofOfServiceRepository'

export { computeMailServiceExtension, SEEDED_MAIL_EXTENSION_JURISDICTIONS } from './engine'
export type { MailExtensionRule } from './engine'
export { generateCertificateOfService } from './certificateOfService'
export type { CertificateOfServiceInput } from './certificateOfService'
export { ProofOfServiceRepository } from './ProofOfServiceRepository'
export { logProofOfService } from './logProofOfService'
export type { LogProofOfServiceDeps, LogProofOfServiceResult } from './logProofOfService'
export type { ProofOfService, ProofOfServiceContent, ProofOfServiceInput, ServiceMethod } from './types'

export const proofOfServiceRepository = new ProofOfServiceRepository(db, vault)

/** Bundles the app's real repository instances for `logProofOfService`, so call sites don't have to re-import and wire all three themselves. */
export const proofOfServiceDeps = { caseRepository, deadlineRepository, proofOfServiceRepository }
