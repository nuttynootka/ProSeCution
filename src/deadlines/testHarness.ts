import { CaseRepository } from '../cases/CaseRepository'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { DeadlineRepository } from './DeadlineRepository'

/** Shared by DeadlineRepository.test.ts: a fresh, isolated, unlocked vault plus the repositories over it. Not used by application code. */
export async function freshUnlockedStore() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')

  return {
    db,
    vault,
    cases: new CaseRepository(db, vault),
    deadlines: new DeadlineRepository(db, vault),
  }
}
