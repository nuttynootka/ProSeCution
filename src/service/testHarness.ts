import { CaseRepository } from '../cases/CaseRepository'
import { DeadlineRepository } from '../deadlines/DeadlineRepository'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { ProofOfServiceRepository } from './ProofOfServiceRepository'

/** Shared by this module's own tests: a fresh, isolated, unlocked vault plus the repositories over it. Not used by application code. */
export async function freshUnlockedStore() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')

  const cases = new CaseRepository(db, vault)
  const deadlines = new DeadlineRepository(db, vault)
  const proofOfService = new ProofOfServiceRepository(db, vault)

  return { db, vault, cases, deadlines, proofOfService }
}
