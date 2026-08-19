import Dexie, { type EntityTable } from 'dexie'
import type { KdfParams } from './crypto'

/**
 * Single-row table holding everything needed to unlock the vault: the passphrase
 * salt, the KDF parameters used (versioned per-record, not global — see
 * CURRENT_KDF_PARAMS), and the wrapped data-encryption key. None of this is
 * sensitive on its own; it's useless without the passphrase.
 */
export interface VaultMetaRecord {
  id: 'singleton'
  salt: Uint8Array
  kdfParams: KdfParams
  wrapIv: Uint8Array
  wrappedDek: Uint8Array
  createdAt: number
}

/**
 * A row's actual content lives entirely in `dataEnc` — one AES-GCM-encrypted JSON
 * blob per record, produced by VaultService.encryptField. Only what a query genuinely
 * needs (the primary key, the foreign key used to look up parties by case, and a
 * sort key) is stored in the clear.
 *
 * This has a consequence worth knowing: because the encrypted payload's *shape* is
 * just TypeScript, not a Dexie schema, adding or renaming a field inside a case or
 * party (e.g. Chunk 24 adding fee-waiver fields to Case) is a plain code change —
 * no `.version()` bump, no migration. A `.version()` bump is only needed when the
 * plain, indexed columns change (a new lookup key, a new table).
 */
export interface StoredCaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  dataEnc: string
}

export interface StoredPartyRecord {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
  dataEnc: string
}

/**
 * Metadata (filename, mime type, size) follows the same `dataEnc` envelope pattern
 * as cases/parties. The file bytes themselves don't — `VaultService.encryptField`
 * exists for text (UTF-8 + base64-in-JSON), which is real overhead per megabyte on
 * a scanned document. `fileIv`/`fileCiphertext` are the raw AES-GCM output stored
 * directly as Dexie Uint8Array fields, the same way vaultMeta stores its own
 * ciphertext bytes — a pattern already proven rather than something new.
 */
export interface StoredDocumentRecord {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
  dataEnc: string
  fileIv: Uint8Array
  fileCiphertext: Uint8Array
}

/**
 * Same envelope pattern as cases/parties/documents. `dueDate` lives inside `dataEnc`
 * like every other content field, not as a plain column — it's exact-litigation-
 * timeline information, no less sensitive than a case type or a document filename,
 * both of which are already encrypted. Listing "soonest first" or "due in the next
 * 14 days" means decrypting a case's deadlines and sorting/filtering in memory, the
 * same tradeoff the rest of this schema already makes for anything content-shaped.
 */
export interface StoredDeadlineRecord {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
  dataEnc: string
}

/**
 * Not case-scoped, unlike everything above — a blank court form (e.g. a fillable
 * Judicial Council form) is a reusable template, not something that belongs to one
 * case. Binary storage follows the documents pattern (`fileIv`/`fileCiphertext`),
 * not the text-field `encryptField` one — a PDF is exactly the kind of large binary
 * content that pattern exists for.
 */
export interface StoredPdfTemplateRecord {
  id: string
  createdAt: number
  updatedAt: number
  dataEnc: string
  fileIv: Uint8Array
  fileCiphertext: Uint8Array
}

/**
 * One record per (templateId, pageNum) — `pageNum` isn't a plain column because
 * Dexie's simple indexes can't express "unique per template+page" without a compound
 * index, and nothing here queries by page number alone, only by template (then
 * filters/finds the page in memory, same tradeoff as everything else content-shaped
 * in this schema).
 */
export interface StoredFieldMappingRecord {
  id: string
  templateId: string
  createdAt: number
  updatedAt: number
  dataEnc: string
}

/**
 * Same envelope pattern as everything else content-shaped. Not indexed by anything
 * beyond caseId/createdAt for the same reason deadlines aren't indexed by dueDate:
 * nothing queries proof-of-service records except "all of them for this case."
 */
export interface StoredProofOfServiceRecord {
  id: string
  caseId: string
  createdAt: number
  updatedAt: number
  dataEnc: string
}

/**
 * The blueprint's `offline_request_queue` table — an AI request (an LLM call this
 * app couldn't make while offline) saved for real replay once connectivity
 * returns, rather than silently dropped. Not case-scoped (a query might span
 * cases, or be a general question), so indexed only by createdAt for FIFO replay
 * order. `attempts` isn't part of the encrypted content — it's operational
 * metadata about the queue entry itself, not sensitive case content, and Chunk
 * 37's replay logic needs to read/increment it without a decrypt round-trip.
 */
export interface StoredOfflineQueueRecord {
  id: string
  createdAt: number
  attempts: number
  dataEnc: string
}

/**
 * Schema versions are additive and permanent: once a `.version(n)` block ships, it
 * is never edited, only superseded by a new `.version(n + 1)` with an `.upgrade()`
 * migration. This is the versioned-migration discipline the blueprint calls for —
 * enforced by convention here since Dexie itself won't stop you from editing history.
 * Each `.version().stores()` call must restate every table, not just the new ones —
 * that's Dexie's own model, not a convention.
 *
 * v1: vault metadata only.
 * v2: cases and parties, indexed by id (+ caseId for parties) and createdAt for
 * chronological listing.
 * v3: documents, indexed the same way as parties (id, caseId, createdAt).
 * v4: deadlines, indexed the same way — dueDate isn't a plain column
 * (see StoredDeadlineRecord), so there's nothing more to index than caseId/createdAt.
 * v5: pdfTemplates (id, createdAt — not case-scoped) and fieldMappings
 * (id, templateId, createdAt).
 * v6: proofOfService, indexed the same way as deadlines/documents/parties
 * (id, caseId, createdAt).
 * v7 (this chunk): offlineQueue, indexed by id and createdAt (FIFO replay order) —
 * not case-scoped, see StoredOfflineQueueRecord.
 */
export class PlcmDatabase extends Dexie {
  vaultMeta!: EntityTable<VaultMetaRecord, 'id'>
  cases!: EntityTable<StoredCaseRecord, 'id'>
  parties!: EntityTable<StoredPartyRecord, 'id'>
  documents!: EntityTable<StoredDocumentRecord, 'id'>
  deadlines!: EntityTable<StoredDeadlineRecord, 'id'>
  pdfTemplates!: EntityTable<StoredPdfTemplateRecord, 'id'>
  fieldMappings!: EntityTable<StoredFieldMappingRecord, 'id'>
  proofOfService!: EntityTable<StoredProofOfServiceRecord, 'id'>
  offlineQueue!: EntityTable<StoredOfflineQueueRecord, 'id'>

  constructor(name = 'plcm') {
    super(name)
    this.version(1).stores({
      vaultMeta: 'id',
    })
    this.version(2).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
    })
    this.version(3).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
    })
    this.version(4).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
    })
    this.version(5).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
      pdfTemplates: 'id, createdAt',
      fieldMappings: 'id, templateId, createdAt',
    })
    this.version(6).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
      pdfTemplates: 'id, createdAt',
      fieldMappings: 'id, templateId, createdAt',
      proofOfService: 'id, caseId, createdAt',
    })
    this.version(7).stores({
      vaultMeta: 'id',
      cases: 'id, createdAt',
      parties: 'id, caseId, createdAt',
      documents: 'id, caseId, createdAt',
      deadlines: 'id, caseId, createdAt',
      pdfTemplates: 'id, createdAt',
      fieldMappings: 'id, templateId, createdAt',
      proofOfService: 'id, caseId, createdAt',
      offlineQueue: 'id, createdAt',
    })
  }
}

export const db = new PlcmDatabase()
