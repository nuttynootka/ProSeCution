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
 * Schema versions are additive and permanent: once a `.version(n)` block ships, it
 * is never edited, only superseded by a new `.version(n + 1)` with an `.upgrade()`
 * migration. This is the versioned-migration discipline the blueprint calls for —
 * enforced by convention here since Dexie itself won't stop you from editing history.
 *
 * v1 (this chunk): vault metadata only. Chunk 4 adds `cases`/`parties` in v2, and so
 * on — each future chunk's schema change is a new version block appended below,
 * never a rewrite of this one.
 */
export class PlcmDatabase extends Dexie {
  vaultMeta!: EntityTable<VaultMetaRecord, 'id'>

  constructor(name = 'plcm') {
    super(name)
    this.version(1).stores({
      vaultMeta: 'id',
    })
  }
}

export const db = new PlcmDatabase()
