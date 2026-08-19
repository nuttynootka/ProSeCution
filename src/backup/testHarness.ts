import { CaseRepository } from '../cases/CaseRepository'
import { PartyRepository } from '../cases/PartyRepository'
import { DeadlineRepository } from '../deadlines/DeadlineRepository'
import { DocumentRepository } from '../documents/DocumentRepository'
import { FieldMappingRepository } from '../pdf/FieldMappingRepository'
import { PdfTemplateRepository } from '../pdf/PdfTemplateRepository'
import { ProofOfServiceRepository } from '../service/ProofOfServiceRepository'
import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'

/** Shared by this module's own tests: a fresh, isolated, unlocked vault plus every repository over it. Not used by application code. */
export async function freshUnlockedStore(passphrase = 'test passphrase') {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp(passphrase)

  return {
    db,
    vault,
    cases: new CaseRepository(db, vault),
    parties: new PartyRepository(db, vault),
    documents: new DocumentRepository(db, vault),
    deadlines: new DeadlineRepository(db, vault),
    pdfTemplates: new PdfTemplateRepository(db, vault),
    fieldMappings: new FieldMappingRepository(db, vault),
    proofOfService: new ProofOfServiceRepository(db, vault),
  }
}
