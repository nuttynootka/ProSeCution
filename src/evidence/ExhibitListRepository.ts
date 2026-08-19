import { monotonicNow } from '../lib/monotonicClock'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { PlcmDatabase, StoredExhibitListRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'

export interface ExhibitItem {
  documentId: string
  description: string
}

export interface ExhibitListContent {
  items: ExhibitItem[]
}

const EMPTY_LIST: ExhibitListContent = { items: [] }

/**
 * One exhibit list per case (id === caseId — see StoredExhibitListRecord's own doc
 * comment). Order in `items` IS the exhibit ordering `exhibitLabel` derives A/B/C
 * from at read time; nothing else tracks order separately, so there's no way for a
 * stored label to drift out of sync with a reorder.
 */
export class ExhibitListRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /** Returns an honest empty list rather than throwing when the case has no exhibit list saved yet. */
  async getForCase(caseId: string): Promise<ExhibitListContent> {
    const record = await this.#db.exhibitLists.get(caseId)
    if (!record) return EMPTY_LIST
    return decryptContent<ExhibitListContent>(this.#vault, record.dataEnc)
  }

  async saveForCase(caseId: string, content: ExhibitListContent): Promise<void> {
    const existing = await this.#db.exhibitLists.get(caseId)
    const now = monotonicNow()
    const record: StoredExhibitListRecord = {
      id: caseId,
      caseId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.exhibitLists.put(record)
  }
}
