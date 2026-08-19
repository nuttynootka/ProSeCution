import { afterEach, describe, expect, it } from 'vitest'
import { monotonicNow } from '../lib/monotonicClock'
import { encryptContent } from '../vault/contentEnvelope'
import type { PlcmDatabase, StoredPdfTemplateRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { createBackupManifest, restoreBackupManifest } from './manifest'
import { freshUnlockedStore } from './testHarness'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness(passphrase?: string) {
  const store = await freshUnlockedStore(passphrase)
  openDbs.push(store.db)
  return store
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

/** Same reasoning as PdfTemplateRepository.test.ts's seedTemplate: create() needs real pdf.js (browser-only), so a template for a storage-layer test is seeded directly. */
async function seedTemplate(db: PlcmDatabase, vault: VaultService, fileBytes: Uint8Array): Promise<string> {
  const { iv: fileIv, ciphertext: fileCiphertext } = await vault.encryptBinary(fileBytes)
  const now = monotonicNow()
  const record: StoredPdfTemplateRecord = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    dataEnc: await encryptContent(vault, { name: 'Sample Summons', pageCount: 2 }),
    fileIv,
    fileCiphertext,
  }
  await db.pdfTemplates.put(record)
  return record.id
}

describe('createBackupManifest / restoreBackupManifest', () => {
  it('round-trips real data — every store, including file bytes — into a completely separate vault', async () => {
    const source = await harness('source passphrase')

    const c = await source.cases.create({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })
    const party = await source.parties.create(c.id, { name: 'R. Cordova', role: 'defendant' })
    const docFile = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' })
    const doc = await source.documents.create(c.id, docFile, 'scan.png')
    const [deadline] = await source.deadlines.createFromTrigger(c.id, 'service_of_summons', Date.UTC(2026, 2, 2))
    const templateFileBytes = new Uint8Array([37, 80, 68, 70]) // "%PDF"
    const templateId = await seedTemplate(source.db, source.vault, templateFileBytes)
    const mapping = await source.fieldMappings.upsertForPage(templateId, 1, [
      { fieldId: 'name', type: 'SINGLE_LINE', boundingBox: { left: 10, top: 10, width: 100, height: 20 } },
    ])
    await source.proofOfService.create(c.id, {
      partyId: party.id,
      partyName: party.name,
      documentDescription: 'Motion to Compel Discovery',
      serviceMethod: 'mail',
      serviceDate: Date.UTC(2026, 2, 5),
      serviceAddress: '123 Main St',
    })

    const manifest = await createBackupManifest(source.db, source.vault)
    expect(manifest.cases).toHaveLength(1)
    expect(manifest.parties).toHaveLength(1)
    expect(manifest.documents).toHaveLength(1)
    expect(manifest.deadlines).toHaveLength(1)
    expect(manifest.pdfTemplates).toHaveLength(1)
    expect(manifest.fieldMappings).toHaveLength(1)
    expect(manifest.proofOfService).toHaveLength(1)
    expect(manifest.documents[0].content.originalFilename).toBe('scan.png')

    // A completely independent vault — different database, different passphrase —
    // proves restore doesn't secretly depend on anything from the source vault.
    const target = await harness('a totally different passphrase')
    await restoreBackupManifest(manifest, target.db, target.vault)

    const restoredCase = await target.cases.get(c.id)
    expect(restoredCase).toMatchObject({ state: 'CA', county: 'Los Angeles', caseType: 'Civil' })

    const restoredParties = await target.parties.listForCase(c.id)
    expect(restoredParties).toHaveLength(1)
    expect(restoredParties[0]).toMatchObject({ id: party.id, name: 'R. Cordova', role: 'defendant' })

    const restoredDoc = await target.documents.get(doc.id)
    expect(restoredDoc?.originalFilename).toBe('scan.png')
    const restoredDocBlob = await target.documents.getFileBlob(doc.id)
    expect(new Uint8Array(await restoredDocBlob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]))

    const restoredDeadline = await target.deadlines.get(deadline.id)
    expect(restoredDeadline?.ruleCitation).toBe('Cal. Civ. Proc. Code § 412.20(a)(3)')

    const restoredTemplateBlob = await target.pdfTemplates.getFileBlob(templateId)
    expect(new Uint8Array(await restoredTemplateBlob!.arrayBuffer())).toEqual(templateFileBytes)

    const restoredMappings = await target.fieldMappings.listForTemplate(templateId)
    expect(restoredMappings).toHaveLength(1)
    expect(restoredMappings[0].id).toBe(mapping.id)
    expect(restoredMappings[0].fields[0].fieldId).toBe('name')

    const restoredPos = await target.proofOfService.listForCase(c.id)
    expect(restoredPos).toHaveLength(1)
    expect(restoredPos[0]).toMatchObject({ partyName: 'R. Cordova', serviceMethod: 'mail' })
  })

  it('produces an empty manifest for an empty vault, and restoring it is a real no-op', async () => {
    const source = await harness()
    const manifest = await createBackupManifest(source.db, source.vault)
    expect(manifest.cases).toEqual([])
    expect(manifest.documents).toEqual([])

    const target = await harness()
    await restoreBackupManifest(manifest, target.db, target.vault)
    expect(await target.cases.list()).toEqual([])
  })
})
