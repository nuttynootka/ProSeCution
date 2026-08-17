import { argon2idAsync } from '@noble/hashes/argon2.js'

/**
 * Argon2id cost parameters, per OWASP's recommended profile for interactive use
 * (19 MiB memory, 2 iterations, single lane). Stored alongside each vault's salt
 * rather than hardcoded at the call site, so a future chunk can tune these — e.g.
 * if real-device benchmarking shows this pure-JS implementation is slower than
 * comfortable — without breaking the ability to unlock vaults created under the
 * old parameters.
 */
export const CURRENT_KDF_PARAMS: KdfParams = {
  algorithm: 'argon2id',
  memoryKib: 19456,
  iterations: 2,
  parallelism: 1,
}

export interface KdfParams {
  algorithm: 'argon2id'
  memoryKib: number
  iterations: number
  parallelism: number
}

const DEK_LENGTH_BYTES = 32 // AES-256
const GCM_IV_LENGTH_BYTES = 12 // NIST SP 800-38D recommended IV length
const SALT_LENGTH_BYTES = 16

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
}

function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH_BYTES))
}

/** Derives a key-encryption key from a passphrase. Deliberately slow — that's Argon2id's job. */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<CryptoKey> {
  const bytes = await argon2idAsync(passphrase, salt, {
    t: params.iterations,
    m: params.memoryKib,
    p: params.parallelism,
    dkLen: DEK_LENGTH_BYTES,
  })
  // Non-extractable: once imported, nothing in this process — including this
  // module — can read the raw key bytes back out. Usages are 'encrypt'/'decrypt'
  // (not 'wrapKey'/'unwrapKey') because wrapDek/unwrapDek below call
  // crypto.subtle.encrypt/decrypt directly rather than the higher-level
  // wrapKey/unwrapKey API — the two usage sets are not interchangeable.
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export function generateDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(DEK_LENGTH_BYTES))
}

export async function importDek(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', extractable, [
    'encrypt',
    'decrypt',
  ])
}

export interface WrappedDek {
  iv: Uint8Array
  ciphertext: Uint8Array
}

/**
 * Wraps (encrypts) the data-encryption key under the passphrase-derived KEK.
 * Envelope encryption: this is the only thing a passphrase change re-encrypts —
 * the DEK, and therefore every field already encrypted under it, never changes.
 */
export async function wrapDek(dek: Uint8Array, kek: CryptoKey): Promise<WrappedDek> {
  const iv = generateIv()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    dek as BufferSource,
  )
  return { iv, ciphertext: new Uint8Array(ciphertext) }
}

/**
 * Unwraps the DEK. AES-GCM's authentication tag is the passphrase check: an
 * incorrect KEK makes this throw rather than return garbage, so there is no
 * separate "is this the right passphrase" verifier to keep in sync.
 */
export async function unwrapDek(wrapped: WrappedDek, kek: CryptoKey): Promise<Uint8Array> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: wrapped.iv as BufferSource },
      kek,
      wrapped.ciphertext as BufferSource,
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new IncorrectPassphraseError()
  }
}

export class IncorrectPassphraseError extends Error {
  constructor() {
    super('Incorrect passphrase.')
    this.name = 'IncorrectPassphraseError'
  }
}

export interface EncryptedField {
  iv: Uint8Array
  ciphertext: Uint8Array
}

export async function encryptBytes(plaintext: Uint8Array, dek: CryptoKey): Promise<EncryptedField> {
  const iv = generateIv()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    plaintext as BufferSource,
  )
  return { iv, ciphertext: new Uint8Array(ciphertext) }
}

export async function decryptBytes(field: EncryptedField, dek: CryptoKey): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: field.iv as BufferSource },
    dek,
    field.ciphertext as BufferSource,
  )
  return new Uint8Array(plaintext)
}
