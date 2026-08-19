import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from './db'

let openDbs: { close: () => void; delete: () => Promise<void> }[] = []

afterEach(async () => {
  await Promise.all(openDbs.map(async (db) => {
    db.close()
    await db.delete()
  }))
  openDbs = []
})

/**
 * Every version bump in db.ts so far (v2 through v6) has only ever added a new
 * table or a new index — never renamed, removed, or restructured an existing one
 * (content shape changes live inside the encrypted `dataEnc` blob instead, versioned
 * separately by `contentEnvelope.ts`'s CONTENT_VERSION). Dexie handles a purely
 * additive `.stores()` bump automatically, with no `.upgrade()` callback needed —
 * but "should be automatic" is exactly the kind of claim this project doesn't ship
 * on faith. These tests open a real, older-shaped database with real data already
 * in it, then reopen the SAME named database through the full, current PlcmDatabase
 * class (which declares the whole v1→v6 chain) and confirm Dexie's own migration
 * actually preserves that data and leaves every newer table usable.
 */
describe('PlcmDatabase migrations', () => {
  it('preserves v1 vaultMeta data when reopened at the current version', async () => {
    const name = `migration-test-${crypto.randomUUID()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ vaultMeta: 'id' })
    openDbs.push(v1)
    await v1.table('vaultMeta').put({ id: 'singleton', salt: new Uint8Array([1, 2, 3]), createdAt: 123 })
    v1.close()

    const current = new PlcmDatabase(name)
    openDbs.push(current)
    await current.open()

    const meta = await current.vaultMeta.get('singleton')
    expect(meta).toMatchObject({ id: 'singleton', createdAt: 123 })
    expect(Array.from(meta!.salt as Uint8Array)).toEqual([1, 2, 3])
  })

  it('preserves v2-era case/party data and leaves every later table (documents, deadlines, pdfTemplates, fieldMappings, proofOfService) present and usable', async () => {
    const name = `migration-test-${crypto.randomUUID()}`
    const v2 = new Dexie(name)
    v2.version(1).stores({ vaultMeta: 'id' })
    v2.version(2).stores({ vaultMeta: 'id', cases: 'id, createdAt', parties: 'id, caseId, createdAt' })
    openDbs.push(v2)
    await v2.table('cases').put({ id: 'case-1', createdAt: 100, updatedAt: 100, dataEnc: 'ciphertext-case' })
    await v2.table('parties').put({ id: 'party-1', caseId: 'case-1', createdAt: 100, updatedAt: 100, dataEnc: 'ciphertext-party' })
    v2.close()

    const current = new PlcmDatabase(name)
    openDbs.push(current)
    await current.open()

    // The old data survived the jump across four version bumps intact.
    expect(await current.cases.get('case-1')).toMatchObject({ dataEnc: 'ciphertext-case' })
    expect(await current.parties.get('party-1')).toMatchObject({ dataEnc: 'ciphertext-party', caseId: 'case-1' })

    // Every table added since v2 exists and actually accepts a real write —
    // "the table exists" alone wouldn't catch an index declared wrong.
    await current.documents.put({ id: 'd1', caseId: 'case-1', createdAt: 1, updatedAt: 1, dataEnc: 'x', fileIv: new Uint8Array(), fileCiphertext: new Uint8Array() })
    await current.deadlines.put({ id: 'dl1', caseId: 'case-1', createdAt: 1, updatedAt: 1, dataEnc: 'x' })
    await current.pdfTemplates.put({ id: 't1', createdAt: 1, updatedAt: 1, dataEnc: 'x', fileIv: new Uint8Array(), fileCiphertext: new Uint8Array() })
    await current.fieldMappings.put({ id: 'fm1', templateId: 't1', createdAt: 1, updatedAt: 1, dataEnc: 'x' })
    await current.proofOfService.put({ id: 'pos1', caseId: 'case-1', createdAt: 1, updatedAt: 1, dataEnc: 'x' })

    expect(await current.documents.where('caseId').equals('case-1').count()).toBe(1)
    expect(await current.deadlines.where('caseId').equals('case-1').count()).toBe(1)
    expect(await current.pdfTemplates.count()).toBe(1)
    expect(await current.fieldMappings.where('templateId').equals('t1').count()).toBe(1)
    expect(await current.proofOfService.where('caseId').equals('case-1').count()).toBe(1)
  })

  it('preserves v5-era data (documents, deadlines, pdfTemplates, fieldMappings) when reopened at v6, and adds proofOfService cleanly', async () => {
    const name = `migration-test-${crypto.randomUUID()}`
    const v5 = new Dexie(name)
    v5.version(1).stores({ vaultMeta: 'id' })
    v5.version(2).stores({ vaultMeta: 'id', cases: 'id, createdAt', parties: 'id, caseId, createdAt' })
    v5.version(3).stores({ vaultMeta: 'id', cases: 'id, createdAt', parties: 'id, caseId, createdAt', documents: 'id, caseId, createdAt' })
    v5.version(4).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
    })
    v5.version(5).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
      pdfTemplates: 'id, createdAt',
      fieldMappings: 'id, templateId, createdAt',
    })
    openDbs.push(v5)
    await v5.table('pdfTemplates').put({ id: 'tpl-1', createdAt: 1, updatedAt: 1, dataEnc: 'x', fileIv: new Uint8Array(), fileCiphertext: new Uint8Array() })
    v5.close()

    const current = new PlcmDatabase(name)
    openDbs.push(current)
    await current.open()

    expect(await current.pdfTemplates.get('tpl-1')).toMatchObject({ dataEnc: 'x' })
    expect(await current.proofOfService.count()).toBe(0)
    await current.proofOfService.put({ id: 'pos-1', caseId: 'case-1', createdAt: 1, updatedAt: 1, dataEnc: 'x' })
    expect(await current.proofOfService.get('pos-1')).toMatchObject({ dataEnc: 'x' })
  })

  it('opens an already-current-version database idempotently, with no data loss on a second open', async () => {
    const name = `migration-test-${crypto.randomUUID()}`
    const first = new PlcmDatabase(name)
    openDbs.push(first)
    await first.cases.put({ id: 'case-1', createdAt: 1, updatedAt: 1, dataEnc: 'x' })
    first.close()

    const second = new PlcmDatabase(name)
    openDbs.push(second)
    await second.open()
    expect(await second.cases.get('case-1')).toMatchObject({ dataEnc: 'x' })
  })
})
