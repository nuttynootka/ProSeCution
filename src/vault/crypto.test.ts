import { describe, expect, it } from 'vitest'
import {
  CURRENT_KDF_PARAMS,
  IncorrectPassphraseError,
  decryptBytes,
  deriveKek,
  encryptBytes,
  generateDek,
  generateSalt,
  importDek,
  unwrapDek,
  wrapDek,
} from './crypto'

// Real Argon2id parameters (CURRENT_KDF_PARAMS) are intentionally slow — that's the
// point of the KDF. Tests that don't care about timing use cheap parameters so the
// suite stays fast; the one test that verifies the real parameters run at all
// tolerates a longer timeout.
const FAST_PARAMS = { algorithm: 'argon2id' as const, memoryKib: 8, iterations: 1, parallelism: 1 }

describe('deriveKek', () => {
  it('derives the same key from the same passphrase and salt', async () => {
    const salt = generateSalt()
    const a = await deriveKek('correct horse battery staple', salt, FAST_PARAMS)
    const b = await deriveKek('correct horse battery staple', salt, FAST_PARAMS)

    // Non-extractable keys can't be compared by value, so compare behavior: encrypt
    // under one, decrypt under the other.
    const dek = generateDek()
    const { iv, ciphertext } = await wrapDek(dek, a)
    const recovered = await unwrapDek({ iv, ciphertext }, b)
    expect(recovered).toEqual(dek)
  })

  it('derives a different key from a different passphrase', async () => {
    const salt = generateSalt()
    const a = await deriveKek('correct horse battery staple', salt, FAST_PARAMS)
    const b = await deriveKek('wrong passphrase entirely', salt, FAST_PARAMS)

    const dek = generateDek()
    const { iv, ciphertext } = await wrapDek(dek, a)
    await expect(unwrapDek({ iv, ciphertext }, b)).rejects.toThrow(IncorrectPassphraseError)
  })

  it('derives a different key from the same passphrase with a different salt', async () => {
    const a = await deriveKek('correct horse battery staple', generateSalt(), FAST_PARAMS)
    const b = await deriveKek('correct horse battery staple', generateSalt(), FAST_PARAMS)

    const dek = generateDek()
    const { iv, ciphertext } = await wrapDek(dek, a)
    await expect(unwrapDek({ iv, ciphertext }, b)).rejects.toThrow(IncorrectPassphraseError)
  })

  it('runs under the real (production) KDF parameters', async () => {
    const salt = generateSalt()
    const kek = await deriveKek('a real passphrase', salt, CURRENT_KDF_PARAMS)
    expect(kek.algorithm.name).toBe('AES-GCM')
  }, 20_000)
})

describe('wrapDek / unwrapDek', () => {
  it('round-trips the DEK through wrap and unwrap', async () => {
    const salt = generateSalt()
    const kek = await deriveKek('passphrase', salt, FAST_PARAMS)
    const dek = generateDek()

    const wrapped = await wrapDek(dek, kek)
    const recovered = await unwrapDek(wrapped, kek)

    expect(recovered).toEqual(dek)
  })

  it('produces a different wrapped value each time (random IV)', async () => {
    const kek = await deriveKek('passphrase', generateSalt(), FAST_PARAMS)
    const dek = generateDek()

    const first = await wrapDek(dek, kek)
    const second = await wrapDek(dek, kek)

    expect(first.iv).not.toEqual(second.iv)
    expect(first.ciphertext).not.toEqual(second.ciphertext)
  })
})

describe('encryptBytes / decryptBytes', () => {
  it('round-trips plaintext', async () => {
    const dek = await importDek(generateDek())
    const plaintext = new TextEncoder().encode('Motion to Dismiss — Case No. 24CV1234')

    const field = await encryptBytes(plaintext, dek)
    const decrypted = await decryptBytes(field, dek)

    expect(decrypted).toEqual(plaintext)
  })

  it('fails to decrypt under a different key', async () => {
    const dekA = await importDek(generateDek())
    const dekB = await importDek(generateDek())
    const plaintext = new TextEncoder().encode('privileged case detail')

    const field = await encryptBytes(plaintext, dekA)

    await expect(decryptBytes(field, dekB)).rejects.toThrow()
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const dek = await importDek(generateDek())
    const plaintext = new TextEncoder().encode('SSN: 000-00-0000')

    const field = await encryptBytes(plaintext, dek)
    const tampered = new Uint8Array(field.ciphertext)
    tampered[0] ^= 0xff // flip a bit — GCM's auth tag must catch this

    await expect(decryptBytes({ iv: field.iv, ciphertext: tampered }, dek)).rejects.toThrow()
  })

  it('does not leak plaintext anywhere in the ciphertext bytes', async () => {
    const dek = await importDek(generateDek())
    const secret = 'THIS-EXACT-STRING-MUST-NOT-APPEAR-IN-CIPHERTEXT'
    const plaintext = new TextEncoder().encode(secret)

    const field = await encryptBytes(plaintext, dek)
    const ciphertextAsLatin1 = Buffer.from(field.ciphertext).toString('latin1')

    expect(ciphertextAsLatin1).not.toContain(secret)
  })
})
