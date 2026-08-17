import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { CaseRepository } from './CaseRepository'
import { PartyRepository } from './PartyRepository'

/**
 * Shared by CaseRepository.test.ts and PartyRepository.test.ts: a fresh, isolated,
 * unlocked vault plus both repositories over it. Not used by application code.
 */
export async function freshUnlockedStore() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')

  return {
    db,
    vault,
    cases: new CaseRepository(db, vault),
    parties: new PartyRepository(db, vault),
  }
}
