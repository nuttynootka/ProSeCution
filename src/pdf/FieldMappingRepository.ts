import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredFieldMappingRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { FieldMapping, FieldMappingContent, TemplateField } from './types'

export class FieldMappingRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /**
   * Creates or replaces the mapping for one page of one template — Template Studio
   * (Chunk 18) re-saves a page's full field list on every edit rather than patching
   * individual fields, so "the mapping for this page" is always one coherent list,
   * never a partial merge of an old and a new one.
   */
  async upsertForPage(templateId: string, pageNum: number, fields: TemplateField[]): Promise<FieldMapping> {
    const existing = await this.getForPage(templateId, pageNum)
    const content: FieldMappingContent = { pageNum, fields }

    if (existing) {
      const updatedAt = monotonicNow()
      await this.#db.fieldMappings.update(existing.id, {
        dataEnc: await encryptContent(this.#vault, content),
        updatedAt,
      })
      return { ...content, id: existing.id, templateId, createdAt: existing.createdAt, updatedAt }
    }

    const now = monotonicNow()
    const record: StoredFieldMappingRecord = {
      id: crypto.randomUUID(),
      templateId,
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.fieldMappings.put(record)
    return this.#hydrate(record, content)
  }

  async getForPage(templateId: string, pageNum: number): Promise<FieldMapping | undefined> {
    const mappings = await this.listForTemplate(templateId)
    return mappings.find((m) => m.pageNum === pageNum)
  }

  /** Page order — the order Template Studio and the autofill pipeline would want to walk a multi-page form in. */
  async listForTemplate(templateId: string): Promise<FieldMapping[]> {
    const records = await this.#db.fieldMappings.where('templateId').equals(templateId).toArray()
    const hydrated = await Promise.all(records.map((r) => this.#hydrate(r)))
    return hydrated.sort((a, b) => a.pageNum - b.pageNum)
  }

  async delete(id: string): Promise<void> {
    await this.#db.fieldMappings.delete(id)
  }

  async #hydrate(record: StoredFieldMappingRecord, content?: FieldMappingContent): Promise<FieldMapping> {
    const resolved = content ?? (await decryptContent<FieldMappingContent>(this.#vault, record.dataEnc))
    return {
      ...resolved,
      id: record.id,
      templateId: record.templateId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}
