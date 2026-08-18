import { monotonicNow } from '../lib/monotonicClock'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { PlcmDatabase, StoredDocumentRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import type { Document, DocumentContent } from './types'

export class DocumentRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /**
   * `filename` is separate from `file` rather than read off it: a `File` (from a
   * file picker) carries `.name`, but a plain `Blob` (e.g. a canvas capture in
   * Chunk 8) doesn't, and this shouldn't care which one a caller has.
   */
  async create(caseId: string, file: Blob, filename: string): Promise<Document> {
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    const { iv: fileIv, ciphertext: fileCiphertext } = await this.#vault.encryptBinary(fileBytes)

    const content: DocumentContent = {
      originalFilename: filename,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    }

    const now = monotonicNow()
    const record: StoredDocumentRecord = {
      id: crypto.randomUUID(),
      caseId,
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
      fileIv,
      fileCiphertext,
    }
    await this.#db.documents.put(record)
    return this.#hydrate(record, content)
  }

  /** Metadata only — doesn't touch (or decrypt) the file bytes, so listing documents never pays for content it isn't showing. */
  async get(id: string): Promise<Document | undefined> {
    const record = await this.#db.documents.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Most recently added first. */
  async listForCase(caseId: string): Promise<Document[]> {
    const records = await this.#db.documents.where('caseId').equals(caseId).sortBy('createdAt')
    return Promise.all(records.reverse().map((record) => this.#hydrate(record)))
  }

  /** Decrypts and returns the actual file content, typed with its original mime type. */
  async getFileBlob(id: string): Promise<Blob | undefined> {
    const record = await this.#db.documents.get(id)
    if (!record) return undefined

    const [content, plaintext] = await Promise.all([
      decryptContent<DocumentContent>(this.#vault, record.dataEnc),
      this.#vault.decryptBinary({ iv: record.fileIv, ciphertext: record.fileCiphertext }),
    ])
    // .slice() rather than passing plaintext directly: TS 5.7+ types a bare
    // `Uint8Array` as backed by `ArrayBufferLike` (which includes SharedArrayBuffer),
    // but BlobPart requires a plain ArrayBuffer specifically. slice() always
    // allocates a fresh standard ArrayBuffer, which satisfies that without an
    // unsound cast.
    return new Blob([plaintext.slice()], { type: content.mimeType })
  }

  /**
   * Persists OCR output onto an existing document. Separate from `create` because
   * OCR (Chunk 9's pipeline) runs after the file is already saved — capture and
   * recognition are two different operations with two different failure modes, and
   * a document should exist and be retrievable even if OCR hasn't run yet or fails.
   */
  async updateOcrResult(
    id: string,
    result: Pick<DocumentContent, 'ocrText' | 'ocrConfidence' | 'documentType'>,
  ): Promise<Document> {
    const record = await this.#db.documents.get(id)
    if (!record) throw new DocumentNotFoundError(id)

    const current = await decryptContent<DocumentContent>(this.#vault, record.dataEnc)
    const updated: DocumentContent = { ...current, ...result }
    const updatedAt = monotonicNow()

    await this.#db.documents.update(id, {
      dataEnc: await encryptContent(this.#vault, updated),
      updatedAt,
    })
    return { ...updated, id, caseId: record.caseId, createdAt: record.createdAt, updatedAt }
  }

  async delete(id: string): Promise<void> {
    await this.#db.documents.delete(id)
  }

  async #hydrate(record: StoredDocumentRecord, content?: DocumentContent): Promise<Document> {
    const resolved = content ?? (await decryptContent<DocumentContent>(this.#vault, record.dataEnc))
    return {
      ...resolved,
      id: record.id,
      caseId: record.caseId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}

export class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document not found: ${id}`)
    this.name = 'DocumentNotFoundError'
  }
}
