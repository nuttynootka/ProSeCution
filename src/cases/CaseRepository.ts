import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredCaseRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from './envelope'
import type { Case, CaseContent, CaseInput } from './types'

export class CaseRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /** Every case starts at the 'pleadings' stage — not caller-supplied, same as id/createdAt. */
  async create(input: CaseInput): Promise<Case> {
    const content: CaseContent = { ...input, currentStage: 'pleadings' }
    const now = monotonicNow()
    const record: StoredCaseRecord = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.cases.put(record)
    return this.#hydrate(record, content)
  }

  async get(id: string): Promise<Case | undefined> {
    const record = await this.#db.cases.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Most recently created first. */
  async list(): Promise<Case[]> {
    const records = await this.#db.cases.orderBy('createdAt').reverse().toArray()
    return Promise.all(records.map((record) => this.#hydrate(record)))
  }

  async update(id: string, patch: Partial<CaseContent>): Promise<Case> {
    const record = await this.#db.cases.get(id)
    if (!record) throw new CaseNotFoundError(id)

    const current = await decryptContent<CaseContent>(this.#vault, record.dataEnc)
    const updated: CaseContent = { ...current, ...patch }
    const updatedAt = monotonicNow()

    await this.#db.cases.update(id, { dataEnc: await encryptContent(this.#vault, updated), updatedAt })
    return { ...updated, id, createdAt: record.createdAt, updatedAt }
  }

  /** Deletes the case and every party attached to it, atomically — no orphaned encrypted party records. */
  async delete(id: string): Promise<void> {
    await this.#db.transaction('rw', this.#db.cases, this.#db.parties, async () => {
      await this.#db.parties.where('caseId').equals(id).delete()
      await this.#db.cases.delete(id)
    })
  }

  /** `content`, if already known (e.g. right after create), skips a redundant decrypt round-trip. */
  async #hydrate(record: StoredCaseRecord, content?: CaseContent): Promise<Case> {
    const resolved = content ?? (await decryptContent<CaseContent>(this.#vault, record.dataEnc))
    return { ...resolved, id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt }
  }
}

export class CaseNotFoundError extends Error {
  constructor(id: string) {
    super(`Case not found: ${id}`)
    this.name = 'CaseNotFoundError'
  }
}
