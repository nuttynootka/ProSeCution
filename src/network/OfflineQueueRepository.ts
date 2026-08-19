import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredOfflineQueueRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'

export interface OfflineQueueItemContent {
  /** Which LLM/retrieval call this was — enough for the real sender (Chunk 38) to know how to replay it. */
  endpoint: string
  requestBody: unknown
}

export interface OfflineQueueItem extends OfflineQueueItemContent {
  id: string
  createdAt: number
  attempts: number
}

/** The blueprint's offline_request_queue table. Same repository shape as every other store — plain db+vault, content-shaped fields inside dataEnc. */
export class OfflineQueueRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  async enqueue(content: OfflineQueueItemContent): Promise<OfflineQueueItem> {
    const now = monotonicNow()
    const record: StoredOfflineQueueRecord = {
      id: crypto.randomUUID(),
      createdAt: now,
      attempts: 0,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.offlineQueue.put(record)
    return this.#hydrate(record, content)
  }

  /** Oldest first — real FIFO replay order. */
  async listPending(): Promise<OfflineQueueItem[]> {
    const records = await this.#db.offlineQueue.orderBy('createdAt').toArray()
    return Promise.all(records.map((r) => this.#hydrate(r)))
  }

  async incrementAttempts(id: string): Promise<void> {
    const record = await this.#db.offlineQueue.get(id)
    if (!record) return
    await this.#db.offlineQueue.update(id, { attempts: record.attempts + 1 })
  }

  async remove(id: string): Promise<void> {
    await this.#db.offlineQueue.delete(id)
  }

  async #hydrate(record: StoredOfflineQueueRecord, content?: OfflineQueueItemContent): Promise<OfflineQueueItem> {
    const resolved = content ?? (await decryptContent<OfflineQueueItemContent>(this.#vault, record.dataEnc))
    return { ...resolved, id: record.id, createdAt: record.createdAt, attempts: record.attempts }
  }
}
