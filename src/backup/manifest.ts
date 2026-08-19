import type { CaseContent, PartyContent } from '../cases/types'
import type { DeadlineContent } from '../deadlines/types'
import type { DocumentContent } from '../documents/types'
import type { FieldMappingContent, PdfTemplateContent } from '../pdf/types'
import type { ProofOfServiceContent } from '../service/types'
import type { PlcmDatabase } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import { base64ToBytes, bytesToBase64 } from '../vault/encoding'
import { BACKUP_MANIFEST_VERSION, type BackupManifest } from './types'

/**
 * Decrypts every record in every store into one plain, portable manifest. Operates
 * directly on `db`/`vault` rather than through each domain's repository — a
 * cross-cutting, whole-database dump like this doesn't belong to any one
 * repository, the same reasoning that keeps schema migrations (`vault/db.ts`)
 * below the repository layer too. Uses `db.<table>.toArray()` (not a repository's
 * `list()`/`listForCase()`) because this needs literally everything, unscoped by
 * case, including the templates/mappings that aren't case-scoped at all.
 */
export async function createBackupManifest(db: PlcmDatabase, vault: VaultService): Promise<BackupManifest> {
  const [caseRecords, partyRecords, documentRecords, deadlineRecords, templateRecords, mappingRecords, posRecords] =
    await Promise.all([
      db.cases.toArray(),
      db.parties.toArray(),
      db.documents.toArray(),
      db.deadlines.toArray(),
      db.pdfTemplates.toArray(),
      db.fieldMappings.toArray(),
      db.proofOfService.toArray(),
    ])

  const cases = await Promise.all(
    caseRecords.map(async (r) => ({
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      content: await decryptContent<CaseContent>(vault, r.dataEnc),
    })),
  )

  const parties = await Promise.all(
    partyRecords.map(async (r) => ({
      id: r.id,
      caseId: r.caseId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      content: await decryptContent<PartyContent>(vault, r.dataEnc),
    })),
  )

  const documents = await Promise.all(
    documentRecords.map(async (r) => {
      const [content, fileBytes] = await Promise.all([
        decryptContent<DocumentContent>(vault, r.dataEnc),
        vault.decryptBinary({ iv: r.fileIv, ciphertext: r.fileCiphertext }),
      ])
      return { id: r.id, caseId: r.caseId, createdAt: r.createdAt, updatedAt: r.updatedAt, content, fileBase64: bytesToBase64(fileBytes) }
    }),
  )

  const deadlines = await Promise.all(
    deadlineRecords.map(async (r) => ({
      id: r.id,
      caseId: r.caseId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      content: await decryptContent<DeadlineContent>(vault, r.dataEnc),
    })),
  )

  const pdfTemplates = await Promise.all(
    templateRecords.map(async (r) => {
      const [content, fileBytes] = await Promise.all([
        decryptContent<PdfTemplateContent>(vault, r.dataEnc),
        vault.decryptBinary({ iv: r.fileIv, ciphertext: r.fileCiphertext }),
      ])
      return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, content, fileBase64: bytesToBase64(fileBytes) }
    }),
  )

  const fieldMappings = await Promise.all(
    mappingRecords.map(async (r) => ({
      id: r.id,
      templateId: r.templateId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      content: await decryptContent<FieldMappingContent>(vault, r.dataEnc),
    })),
  )

  const proofOfService = await Promise.all(
    posRecords.map(async (r) => ({
      id: r.id,
      caseId: r.caseId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      content: await decryptContent<ProofOfServiceContent>(vault, r.dataEnc),
    })),
  )

  return {
    version: BACKUP_MANIFEST_VERSION,
    createdAt: Date.now(),
    cases,
    parties,
    documents,
    deadlines,
    pdfTemplates,
    fieldMappings,
    proofOfService,
  }
}

/**
 * Re-encrypts every record in a manifest under the CURRENT vault's own DEK and
 * writes it back — the inverse of createBackupManifest. Preserves every original
 * id/caseId/templateId/timestamp exactly, so restoring a backup reproduces the
 * exact same records (and the same cross-references between them — a party's
 * `caseId`, a mapping's `templateId`) rather than merely similar-looking new ones.
 * `bulkPut` (not `bulkAdd`) so restoring into a vault that already has some of
 * these records (e.g. retrying a partial restore) overwrites rather than
 * conflicting on a duplicate key.
 */
export async function restoreBackupManifest(manifest: BackupManifest, db: PlcmDatabase, vault: VaultService): Promise<void> {
  const cases = await Promise.all(
    manifest.cases.map(async (c) => ({
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      dataEnc: await encryptContent(vault, c.content),
    })),
  )

  const parties = await Promise.all(
    manifest.parties.map(async (p) => ({
      id: p.id,
      caseId: p.caseId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dataEnc: await encryptContent(vault, p.content),
    })),
  )

  const documents = await Promise.all(
    manifest.documents.map(async (d) => {
      const { iv: fileIv, ciphertext: fileCiphertext } = await vault.encryptBinary(base64ToBytes(d.fileBase64))
      return {
        id: d.id,
        caseId: d.caseId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        dataEnc: await encryptContent(vault, d.content),
        fileIv,
        fileCiphertext,
      }
    }),
  )

  const deadlines = await Promise.all(
    manifest.deadlines.map(async (dl) => ({
      id: dl.id,
      caseId: dl.caseId,
      createdAt: dl.createdAt,
      updatedAt: dl.updatedAt,
      dataEnc: await encryptContent(vault, dl.content),
    })),
  )

  const pdfTemplates = await Promise.all(
    manifest.pdfTemplates.map(async (t) => {
      const { iv: fileIv, ciphertext: fileCiphertext } = await vault.encryptBinary(base64ToBytes(t.fileBase64))
      return {
        id: t.id,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        dataEnc: await encryptContent(vault, t.content),
        fileIv,
        fileCiphertext,
      }
    }),
  )

  const fieldMappings = await Promise.all(
    manifest.fieldMappings.map(async (m) => ({
      id: m.id,
      templateId: m.templateId,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      dataEnc: await encryptContent(vault, m.content),
    })),
  )

  const proofOfService = await Promise.all(
    manifest.proofOfService.map(async (p) => ({
      id: p.id,
      caseId: p.caseId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dataEnc: await encryptContent(vault, p.content),
    })),
  )

  await db.transaction(
    'rw',
    [db.cases, db.parties, db.documents, db.deadlines, db.pdfTemplates, db.fieldMappings, db.proofOfService],
    async () => {
      await Promise.all([
        db.cases.bulkPut(cases),
        db.parties.bulkPut(parties),
        db.documents.bulkPut(documents),
        db.deadlines.bulkPut(deadlines),
        db.pdfTemplates.bulkPut(pdfTemplates),
        db.fieldMappings.bulkPut(fieldMappings),
        db.proofOfService.bulkPut(proofOfService),
      ])
    },
  )
}
