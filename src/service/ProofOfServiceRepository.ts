import { monotonicNow } from '../lib/monotonicClock'
import type { PlcmDatabase, StoredProofOfServiceRecord } from '../vault/db'
import type { VaultService } from '../vault/VaultService'
import { decryptContent, encryptContent } from '../vault/contentEnvelope'
import type { ProofOfService, ProofOfServiceContent } from './types'

/** Plain storage only — same split as every other repository here. Computing the mail-service extension and creating a linked deadline is `logProofOfService`'s job, not this repository's. */
export class ProofOfServiceRepository {
  #db: PlcmDatabase
  #vault: VaultService

  constructor(db: PlcmDatabase, vault: VaultService) {
    this.#db = db
    this.#vault = vault
  }

  async create(caseId: string, content: ProofOfServiceContent): Promise<ProofOfService> {
    const now = monotonicNow()
    const record: StoredProofOfServiceRecord = {
      id: crypto.randomUUID(),
      caseId,
      createdAt: now,
      updatedAt: now,
      dataEnc: await encryptContent(this.#vault, content),
    }
    await this.#db.proofOfService.put(record)
    return this.#hydrate(record, content)
  }

  async get(id: string): Promise<ProofOfService | undefined> {
    const record = await this.#db.proofOfService.get(id)
    if (!record) return undefined
    return this.#hydrate(record)
  }

  /** Most recently logged first — the order a Proof of Service list is most useful in. */
  async listForCase(caseId: string): Promise<ProofOfService[]> {
    const records = await this.#db.proofOfService.where('caseId').equals(caseId).reverse().sortBy('createdAt')
    return Promise.all(records.map((record) => this.#hydrate(record)))
  }

  async delete(id: string): Promise<void> {
    await this.#db.proofOfService.delete(id)
  }

  async #hydrate(record: StoredProofOfServiceRecord, content?: ProofOfServiceContent): Promise<ProofOfService> {
    const resolved = content ?? (await decryptContent<ProofOfServiceContent>(this.#vault, record.dataEnc))
    return {
      ...resolved,
      id: record.id,
      caseId: record.caseId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}
