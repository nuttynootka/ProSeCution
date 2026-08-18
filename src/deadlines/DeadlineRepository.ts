import { CaseNotFoundError } from '../cases/CaseRepository'
import type { CaseContent } from '../cases/types'
import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredDeadlineRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import { calculateDeadlines, type TriggerEvent } from './engine'
import type { Deadline, DeadlineContent, DeadlineStatus } from './types'

export class DeadlineRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  /**
   * Runs the calculation engine against the case's own jurisdiction (its `state`,
   * looked up directly rather than taken as a parameter, so a caller can't pass a
   * jurisdiction that doesn't match the case) and persists whatever it returns. That
   * can be zero deadlines — an unseeded jurisdiction, or a trigger with no rule —
   * which is a legitimate outcome here, not an error: the engine already chose to
   * say "we don't cover this" rather than guess, and this just carries that through.
   */
  async createFromTrigger(caseId: string, trigger: TriggerEvent, triggerDate: number): Promise<Deadline[]> {
    const caseRecord = await this.#db.cases.get(caseId)
    if (!caseRecord) throw new CaseNotFoundError(caseId)
    const caseContent = await decryptContent<CaseContent>(this.#vault, caseRecord.dataEnc)

    const calculated = calculateDeadlines(caseContent.state, trigger, triggerDate)
    const created: Deadline[] = []
    for (const result of calculated) {
      const content: DeadlineContent = { ...result, trigger, triggerDate, status: 'pending' }
      const now = monotonicNow()
      const record: StoredDeadlineRecord = {
        id: crypto.randomUUID(),
        caseId,
        createdAt: now,
        updatedAt: now,
        dataEnc: await encryptContent(this.#vault, content),
      }
      await this.#db.deadlines.put(record)
      created.push(await this.#hydrate(record, content))
    }
    return created
  }

  /**
   * Persists a deadline whose content was already fully computed by the caller,
   * bypassing `calculateDeadlines` entirely. `createFromTrigger` is right for "run
   * the seeded rule engine off a trigger date"; this is for the other legitimate way
   * a deadline gets created in this app — Chunk 23's proof-of-service flow, which
   * derives a due date from an *existing* deadline plus a mail-service extension, not
   * from a trigger date. Kept on this repository rather than duplicated elsewhere so
   * every deadline, however it was computed, goes through the same encryption and
   * hydration path.
   */
  async createDirect(caseId: string, content: DeadlineContent): Promise<Deadline> {
    const now = monotonicNow()
    const record: StoredDeadlineRecord = {
      id: crypto.randomUUID(),
      caseId,
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.deadlines.put(record)
    return this.#hydrate(record, content)
  }

  async get(id: string): Promise<Deadline | undefined> {
    const record = await this.#db.deadlines.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Soonest due date first — dueDate isn't an indexed column (see StoredDeadlineRecord), so this sorts in memory after decrypting. */
  async listForCase(caseId: string): Promise<Deadline[]> {
    const records = await this.#db.deadlines.where('caseId').equals(caseId).toArray()
    const hydrated = await Promise.all(records.map((r) => this.#hydrate(r)))
    return hydrated.sort((a, b) => a.dueDate - b.dueDate)
  }

  /** Every deadline across every case, soonest due first — the Deadlines tab is a cross-case view, unlike everything else in this app that's scoped to one case at a time. */
  async listAll(): Promise<Deadline[]> {
    const records = await this.#db.deadlines.toArray()
    const hydrated = await Promise.all(records.map((r) => this.#hydrate(r)))
    return hydrated.sort((a, b) => a.dueDate - b.dueDate)
  }

  async setStatus(id: string, status: DeadlineStatus): Promise<Deadline> {
    const record = await this.#db.deadlines.get(id)
    if (!record) throw new DeadlineNotFoundError(id)

    const current = await decryptContent<DeadlineContent>(this.#vault, record.dataEnc)
    const updated: DeadlineContent = { ...current, status }
    const updatedAt = monotonicNow()

    await this.#db.deadlines.update(id, { dataEnc: await encryptContent(this.#vault, updated), updatedAt })
    return { ...updated, id, caseId: record.caseId, createdAt: record.createdAt, updatedAt }
  }

  async delete(id: string): Promise<void> {
    await this.#db.deadlines.delete(id)
  }

  async #hydrate(record: StoredDeadlineRecord, content?: DeadlineContent): Promise<Deadline> {
    const resolved = content ?? (await decryptContent<DeadlineContent>(this.#vault, record.dataEnc))
    return {
      ...resolved,
      id: record.id,
      caseId: record.caseId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}

export class DeadlineNotFoundError extends Error {
  constructor(id: string) {
    super(`Deadline not found: ${id}`)
    this.name = 'DeadlineNotFoundError'
  }
}
