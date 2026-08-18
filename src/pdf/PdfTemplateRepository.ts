import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredPdfTemplateRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { PdfTemplate, PdfTemplateContent } from './types'

export class PdfTemplateRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /**
   * `pageCount` comes from actually parsing the file with pdf.js, not a
   * caller-supplied number — a template's page count should never disagree with the
   * PDF it's a template for.
   *
   * `./PdfService` is imported dynamically here, not at module scope: pdf.js
   * references browser globals (`DOMMatrix`, etc.) at *import* time, not just when
   * actually used, which breaks merely constructing a `PdfTemplateRepository` under
   * Vitest's Node environment. Deferring the import to the one method that actually
   * needs pdf.js keeps every other method (get/list/delete/getFileBlob) testable in
   * Node, matching how `create()` itself is verified against a real browser instead
   * (see e2e/pdf.spec.ts) rather than in Vitest.
   */
  async create(file: Blob, name: string, formType?: string, category?: string): Promise<PdfTemplate> {
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    const { loadPdf } = await import('./PdfService')
    const doc = await loadPdf(fileBytes.slice())
    const pageCount = doc.pageCount
    doc.destroy()

    const { iv: fileIv, ciphertext: fileCiphertext } = await this.#vault.encryptBinary(fileBytes)
    const content: PdfTemplateContent = { name, formType, category, pageCount }
    const now = monotonicNow()
    const record: StoredPdfTemplateRecord = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
      fileIv,
      fileCiphertext,
    }
    await this.#db.pdfTemplates.put(record)
    return this.#hydrate(record, content)
  }

  async get(id: string): Promise<PdfTemplate | undefined> {
    const record = await this.#db.pdfTemplates.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Most recently added first. */
  async list(): Promise<PdfTemplate[]> {
    const records = await this.#db.pdfTemplates.orderBy('createdAt').reverse().toArray()
    return Promise.all(records.map((record) => this.#hydrate(record)))
  }

  async getFileBlob(id: string): Promise<Blob | undefined> {
    const record = await this.#db.pdfTemplates.get(id)
    if (!record) return undefined
    const plaintext = await this.#vault.decryptBinary({ iv: record.fileIv, ciphertext: record.fileCiphertext })
    return new Blob([plaintext.slice()], { type: 'application/pdf' })
  }

  /** Deletes the template and every field mapping that references it — an orphaned mapping pointing at a template that no longer exists would be silently useless. */
  async delete(id: string): Promise<void> {
    await this.#db.transaction('rw', this.#db.pdfTemplates, this.#db.fieldMappings, async () => {
      await this.#db.fieldMappings.where('templateId').equals(id).delete()
      await this.#db.pdfTemplates.delete(id)
    })
  }

  async #hydrate(record: StoredPdfTemplateRecord, content?: PdfTemplateContent): Promise<PdfTemplate> {
    const resolved = content ?? (await decryptContent<PdfTemplateContent>(this.#vault, record.dataEnc))
    return { ...resolved, id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt }
  }
}
