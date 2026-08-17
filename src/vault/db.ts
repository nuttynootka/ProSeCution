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
 * v3 (this chunk): documents, indexed the same way as parties (id, caseId, createdAt).
 */
export class PlcmDatabase extends Dexie {
  vaultMeta!: EntityTable<VaultMetaRecord, 'id'>
  cases!: EntityTable<StoredCaseRecord, 'id'>
  parties!: EntityTable<StoredPartyRecord, 'id'>
  documents!: EntityTable<StoredDocumentRecord, 'id'>

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
  }
}

export const db = new PlcmDatabase()
