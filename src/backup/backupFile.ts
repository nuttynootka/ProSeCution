import { CURRENT_KDF_PARAMS, decryptBytes, deriveKek, encryptBytes, generateSalt, type KdfParams } from '../vault/crypto'
import { base64ToBytes, bytesToBase64 } from '../vault/encoding'
import type { BackupManifest } from './types'

export const BACKUP_FILE_VERSION = 1

interface BackupFileFormat {
  formatVersion: number
  createdAt: number
  salt: string
  kdfParams: KdfParams
  iv: string
  ciphertext: string
}

export class IncorrectBackupPassphraseError extends Error {
  constructor() {
    super('Incorrect passphrase for this backup file.')
    this.name = 'IncorrectBackupPassphraseError'
  }
}

export class InvalidBackupFileError extends Error {
  constructor() {
    super('This does not look like a valid backup file.')
    this.name = 'InvalidBackupFileError'
  }
}

/**
 * The `.plcmbackup` format: a plain JSON envelope (version, salt, KDF params, IV)
 * around an AES-256-GCM ciphertext, deliberately reusing the exact same primitives
 * as the vault's own passphrase unlock (`vault/crypto.ts` — Argon2id KDF, AES-GCM)
 * rather than inventing a second encryption scheme for one file format. The salt
 * and KDF params travel in the clear alongside the ciphertext (same as
 * `VaultMetaRecord` does inside IndexedDB) — neither is sensitive on its own, and a
 * restore has no other database to read them from.
 *
 * Encrypted under a passphrase supplied at export time, not silently reused from
 * the currently-unlocked vault's own passphrase — a backup file is meant to be
 * portable to a different device with a different (or not-yet-chosen) vault
 * passphrase, so tying it to "whatever this vault's passphrase happens to be right
 * now" would be the wrong coupling.
 */
export async function encryptBackupFile(manifest: BackupManifest, passphrase: string): Promise<Uint8Array> {
  const salt = generateSalt()
  const kek = await deriveKek(passphrase, salt, CURRENT_KDF_PARAMS)
  const plaintext = new TextEncoder().encode(JSON.stringify(manifest))
  const { iv, ciphertext } = await encryptBytes(plaintext, kek)

  const file: BackupFileFormat = {
    formatVersion: BACKUP_FILE_VERSION,
    createdAt: Date.now(),
    salt: bytesToBase64(salt),
    kdfParams: CURRENT_KDF_PARAMS,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  }
  return new TextEncoder().encode(JSON.stringify(file))
}

function isBackupFileFormat(value: unknown): value is BackupFileFormat {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.salt === 'string' && typeof v.iv === 'string' && typeof v.ciphertext === 'string' && typeof v.kdfParams === 'object'
}

/** Throws InvalidBackupFileError for anything that isn't real backup-file JSON, and IncorrectBackupPassphraseError for real backup-file JSON that won't decrypt under the given passphrase — AES-GCM's own authentication tag is what actually detects a wrong passphrase (or a tampered file), same as the vault's own unwrapDek. */
export async function decryptBackupFile(fileBytes: Uint8Array, passphrase: string): Promise<BackupManifest> {
  let file: unknown
  try {
    file = JSON.parse(new TextDecoder().decode(fileBytes))
  } catch {
    throw new InvalidBackupFileError()
  }
  if (!isBackupFileFormat(file)) throw new InvalidBackupFileError()

  const salt = base64ToBytes(file.salt)
  const kek = await deriveKek(passphrase, salt, file.kdfParams)
  const iv = base64ToBytes(file.iv)
  const ciphertext = base64ToBytes(file.ciphertext)

  let plaintext: Uint8Array
  try {
    plaintext = await decryptBytes({ iv, ciphertext }, kek)
  } catch {
    throw new IncorrectBackupPassphraseError()
  }

  return JSON.parse(new TextDecoder().decode(plaintext)) as BackupManifest
}
