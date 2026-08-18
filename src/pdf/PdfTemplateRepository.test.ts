import { afterEach, describe, expect, it } from 'vitest'
import { monotonicNow } from '../lib/monotonicClock'
import { encryptContent } from '../vault/contentEnvelope'
import type { PlcmDatabase, StoredPdfTemplateRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { freshUnlockedStore } from './testHarness'
import type { PdfTemplateContent } from './types'

let openDbs: { delete: () => Promise<void> }[] = []

async function harness() {
  const store = await freshUnlockedStore()
  openDbs.push(store.db)
  return store
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

/**
 * `PdfTemplateRepository.create()` calls pdf.js (`loadPdf`) to determine the real
 * page count, and pdf.js's browser build needs DOM globals (`DOMMatrix`, etc.) that
 * don't exist under Vitest's Node environment — the same category of browser-only
 * dependency as Tesseract OCR or the camera capture pipeline elsewhere in this app.
 * `create()` itself is verified against a real browser instead (see e2e/pdf.spec.ts).
 * Everything below it — encryption, retrieval, cascade delete — doesn't touch pdf.js
 * at all, so it's seeded directly at the storage layer here and tested for real.
 */
async function seedTemplate(
  db: PlcmDatabase,
  vault: VaultService,
  content: PdfTemplateContent,
  fileBytes: Uint8Array,
): Promise<string> {
  const { iv: fileIv, ciphertext: fileCiphertext } = await vault.encryptBinary(fileBytes)
  const now = monotonicNow()
  const record: StoredPdfTemplateRecord = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    dataEnc: await encryptContent(vault, content),
    fileIv,
    fileCiphertext,
  }
  await db.pdfTemplates.put(record)
  return record.id
}

describe('get / list', () => {
  it('returns a seeded template by id', async () => {
    const { db, vault, pdfTemplates } = await harness()
    const id = await seedTemplate(db, vault, { name: 'Summons', pageCount: 2 }, new Uint8Array([1, 2, 3]))

    const found = await pdfTemplates.get(id)

    expect(found?.name).toBe('Summons')
    expect(found?.pageCount).toBe(2)
  })

  it('returns undefined for an unknown id', async () => {
    const { pdfTemplates } = await harness()
    expect(await pdfTemplates.get('does-not-exist')).toBeUndefined()
  })

  it('lists templates most recently added first', async () => {
    const { db, vault, pdfTemplates } = await harness()
    const first = await seedTemplate(db, vault, { name: 'A', pageCount: 1 }, new Uint8Array([1]))
    const second = await seedTemplate(db, vault, { name: 'B', pageCount: 1 }, new Uint8Array([2]))

    const list = await pdfTemplates.list()

    expect(list.map((t) => t.id)).toEqual([second, first])
  })

  it('stores template metadata and file bytes encrypted — the raw record contains no plaintext', async () => {
    const { db, vault } = await harness()
    await seedTemplate(db, vault, { name: 'DISTINCTIVE-TEMPLATE-NAME', pageCount: 3 }, new Uint8Array([9, 9, 9]))

    const [raw] = await db.pdfTemplates.toArray()
    expect(JSON.stringify(raw.dataEnc)).not.toContain('DISTINCTIVE-TEMPLATE-NAME')
  })
})

describe('getFileBlob', () => {
  it('round-trips the exact file bytes as an application/pdf blob', async () => {
    const { db, vault, pdfTemplates } = await harness()
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 253, 254, 255])
    const id = await seedTemplate(db, vault, { name: 'Form', pageCount: 1 }, bytes)

    const blob = await pdfTemplates.getFileBlob(id)

    expect(blob?.type).toBe('application/pdf')
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes)
  })

  it('returns undefined for an unknown id', async () => {
    const { pdfTemplates } = await harness()
    expect(await pdfTemplates.getFileBlob('does-not-exist')).toBeUndefined()
  })
})

describe('delete', () => {
  it('removes the template', async () => {
    const { db, vault, pdfTemplates } = await harness()
    const id = await seedTemplate(db, vault, { name: 'Form', pageCount: 1 }, new Uint8Array([1]))

    await pdfTemplates.delete(id)

    expect(await pdfTemplates.get(id)).toBeUndefined()
  })

  it('cascades to every field mapping that references the template', async () => {
    const { db, vault, pdfTemplates, fieldMappings } = await harness()
    const id = await seedTemplate(db, vault, { name: 'Form', pageCount: 2 }, new Uint8Array([1]))
    await fieldMappings.upsertForPage(id, 1, [])
    await fieldMappings.upsertForPage(id, 2, [])

    await pdfTemplates.delete(id)

    expect(await fieldMappings.listForTemplate(id)).toEqual([])
  })

  it('does not affect field mappings belonging to a different template', async () => {
    const { db, vault, pdfTemplates, fieldMappings } = await harness()
    const templateA = await seedTemplate(db, vault, { name: 'A', pageCount: 1 }, new Uint8Array([1]))
    const templateB = await seedTemplate(db, vault, { name: 'B', pageCount: 1 }, new Uint8Array([2]))
    await fieldMappings.upsertForPage(templateB, 1, [])

    await pdfTemplates.delete(templateA)

    expect(await fieldMappings.listForTemplate(templateB)).toHaveLength(1)
  })
})
