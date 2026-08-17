import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredPartyRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { Party, PartyContent } from './types'

export class PartyRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  async create(caseId: string, content: PartyContent): Promise<Party> {
    const now = monotonicNow()
    const record: StoredPartyRecord = {
      id: crypto.randomUUID(),
      caseId,
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.parties.put(record)
    return this.#hydrate(record, content)
  }

  async get(id: string): Promise<Party | undefined> {
    const record = await this.#db.parties.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Creation order — the order a user added parties in, which is the order the wizard and case screens display them in. */
  async listForCase(caseId: string): Promise<Party[]> {
    const records = await this.#db.parties.where('caseId').equals(caseId).sortBy('createdAt')
    return Promise.all(records.map((record) => this.#hydrate(record)))
  }

  async update(id: string, patch: Partial<PartyContent>): Promise<Party> {
    const record = await this.#db.parties.get(id)
    if (!record) throw new PartyNotFoundError(id)

    const current = await decryptContent<PartyContent>(this.#vault, record.dataEnc)
    const updated: PartyContent = { ...current, ...patch }
    const updatedAt = monotonicNow()

    await this.#db.parties.update(id, {
      dataEnc: await encryptContent(this.#vault, updated),
      updatedAt,
    })
    return { ...updated, id, caseId: record.caseId, createdAt: record.createdAt, updatedAt }
  }

  async delete(id: string): Promise<void> {
    await this.#db.parties.delete(id)
  }

  /** `content`, if already known (e.g. right after create), skips a redundant decrypt round-trip. */
  async #hydrate(record: StoredPartyRecord, content?: PartyContent): Promise<Party> {
    const resolved = content ?? (await decryptContent<PartyContent>(this.#vault, record.dataEnc))
    return {
      ...resolved,
      id: record.id,
      caseId: record.caseId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}

export class PartyNotFoundError extends Error {
  constructor(id: string) {
    super(`Party not found: ${id}`)
    this.name = 'PartyNotFoundError'
  }
}
