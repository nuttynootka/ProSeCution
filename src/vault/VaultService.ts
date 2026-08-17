import { base64ToBytes, bytesToBase64 } from './encoding'
import type { PlcmDatabase } from './db'
import {
  CURRENT_KDF_PARAMS,
  decryptBytes,
  deriveKek,
  encryptBytes,
  generateDek,
  generateSalt,
  importDek,
  unwrapDek,
  wrapDek,
  type EncryptedField,
} from './crypto'

export class VaultNotSetUpError extends Error {
  constructor() {
    super('Vault has not been set up yet.')
    this.name = 'VaultNotSetUpError'
  }
}

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked.')
    this.name = 'VaultLockedError'
  }
}

export class VaultAlreadySetUpError extends Error {
  constructor() {
    super('Vault has already been set up.')
    this.name = 'VaultAlreadySetUpError'
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Owns the vault's lock state and every encryption/decryption operation in the app.
 *
 * There is deliberately no "reset" or "force unlock" method. A forgotten passphrase
 * is unrecoverable by design — the only way back in is restoring from a backup made
 * under a different passphrase (Chunk 26). Surfacing that tradeoff clearly to the
 * user is a Settings/Vault-screen concern for a later chunk; this class just holds
 * the line on it.
 */
export class VaultService {
  #db: PlcmDatabase
  #dek: CryptoKey | null = null

  constructor(db: PlcmDatabase) {
    this.#db = db
  }

  isUnlocked(): boolean {
    return this.#dek !== null
  }

  async isSetUp(): Promise<boolean> {
    const meta = await this.#db.vaultMeta.get('singleton')
    return meta !== undefined
  }

  /** Creates the vault for the first time: new salt, new DEK, DEK wrapped under the given passphrase. */
  async setUp(passphrase: string): Promise<void> {
    if (await this.isSetUp()) throw new VaultAlreadySetUpError()

    const salt = generateSalt()
    const kdfParams = CURRENT_KDF_PARAMS
    const kek = await deriveKek(passphrase, salt, kdfParams)

    const dekBytes = generateDek()
    const { iv: wrapIv, ciphertext: wrappedDek } = await wrapDek(dekBytes, kek)

    await this.#db.vaultMeta.put({
      id: 'singleton',
      salt,
      kdfParams,
      wrapIv,
      wrappedDek,
      createdAt: Date.now(),
    })

    this.#dek = await importDek(dekBytes)
  }

  /** Derives the KEK from the given passphrase and unwraps the stored DEK. Throws IncorrectPassphraseError on mismatch. */
  async unlock(passphrase: string): Promise<void> {
    const meta = await this.#db.vaultMeta.get('singleton')
    if (!meta) throw new VaultNotSetUpError()

    const kek = await deriveKek(passphrase, meta.salt, meta.kdfParams)
    const dekBytes = await unwrapDek({ iv: meta.wrapIv, ciphertext: meta.wrappedDek }, kek)
    this.#dek = await importDek(dekBytes)
  }

  /** Drops the in-memory key. Encrypted data on disk is untouched and unreadable until the next unlock. */
  lock(): void {
    this.#dek = null
  }

  /**
   * Re-wraps the existing DEK under a new passphrase. The DEK itself never changes,
   * so every field already encrypted under it stays readable — only the wrapping
   * around the key changes, not the key.
   */
  async changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<void> {
    const meta = await this.#db.vaultMeta.get('singleton')
    if (!meta) throw new VaultNotSetUpError()

    const currentKek = await deriveKek(currentPassphrase, meta.salt, meta.kdfParams)
    const dekBytes = await unwrapDek({ iv: meta.wrapIv, ciphertext: meta.wrappedDek }, currentKek)

    const newSalt = generateSalt()
    const newKdfParams = CURRENT_KDF_PARAMS
    const newKek = await deriveKek(newPassphrase, newSalt, newKdfParams)
    const { iv: wrapIv, ciphertext: wrappedDek } = await wrapDek(dekBytes, newKek)

    await this.#db.vaultMeta.put({
      ...meta,
      salt: newSalt,
      kdfParams: newKdfParams,
      wrapIv,
      wrappedDek,
    })
  }

  /** Encrypts a UTF-8 string, returning a single string safe to store in any Dexie field. */
  async encryptField(plaintext: string): Promise<string> {
    if (!this.#dek) throw new VaultLockedError()
    const { iv, ciphertext } = await encryptBytes(textEncoder.encode(plaintext), this.#dek)
    return packField({ iv, ciphertext })
  }

  /** Inverse of encryptField. Throws if locked, or if the ciphertext was tampered with or encrypted under a different DEK. */
  async decryptField(packed: string): Promise<string> {
    if (!this.#dek) throw new VaultLockedError()
    const field = unpackField(packed)
    const plaintext = await decryptBytes(field, this.#dek)
    return textDecoder.decode(plaintext)
  }
}

const FIELD_SEPARATOR = '.'

function packField(field: EncryptedField): string {
  return `${bytesToBase64(field.iv)}${FIELD_SEPARATOR}${bytesToBase64(field.ciphertext)}`
}

function unpackField(packed: string): EncryptedField {
  const separatorIndex = packed.indexOf(FIELD_SEPARATOR)
  if (separatorIndex === -1) throw new Error('Malformed encrypted field.')
  return {
    iv: base64ToBytes(packed.slice(0, separatorIndex)),
    ciphertext: base64ToBytes(packed.slice(separatorIndex + 1)),
  }
}
