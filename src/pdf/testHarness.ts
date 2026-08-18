import { PlcmDatabase } from '../vault/db'
import { VaultService } from '../vault/VaultService'
import { FieldMappingRepository } from './FieldMappingRepository'
import { PdfTemplateRepository } from './PdfTemplateRepository'

/** Shared by PdfTemplateRepository.test.ts and FieldMappingRepository.test.ts: a fresh, isolated, unlocked vault plus both repositories over it. Not used by application code. */
export async function freshUnlockedStore() {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  const vault = new VaultService(db)
  await vault.setUp('test passphrase')

  return {
    db,
    vault,
    pdfTemplates: new PdfTemplateRepository(db, vault),
    fieldMappings: new FieldMappingRepository(db, vault),
  }
}
