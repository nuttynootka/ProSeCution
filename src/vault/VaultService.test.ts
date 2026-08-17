import { afterEach, describe, expect, it } from 'vitest'
import { PlcmDatabase } from './db'
import {
  VaultAlreadySetUpError,
  VaultLockedError,
  VaultNotSetUpError,
  VaultService,
} from './VaultService'
import { IncorrectPassphraseError } from './crypto'

// Each test gets its own database (fake-indexeddb is a shared in-process polyfill,
// so isolation is by name, not by process) and is torn down after — nothing here
// depends on test execution order.
let openDbs: PlcmDatabase[] = []

function freshVault(): { db: PlcmDatabase; vault: VaultService } {
  const db = new PlcmDatabase(`test-${crypto.randomUUID()}`)
  openDbs.push(db)
  return { db, vault: new VaultService(db) }
}

afterEach(async () => {
  await Promise.all(openDbs.map((db) => db.delete()))
  openDbs = []
})

describe('setUp', () => {
  it('leaves the vault unlocked immediately after setup', async () => {
    const { vault } = freshVault()
    expect(vault.isUnlocked()).toBe(false)

    await vault.setUp('correct horse battery staple')

    expect(vault.isUnlocked()).toBe(true)
  })

  it('reports isSetUp() correctly before and after', async () => {
    const { vault } = freshVault()
    expect(await vault.isSetUp()).toBe(false)

    await vault.setUp('correct horse battery staple')

    expect(await vault.isSetUp()).toBe(true)
  })

  it('refuses to set up a second time', async () => {
    const { vault } = freshVault()
    await vault.setUp('first passphrase')

    await expect(vault.setUp('second passphrase')).rejects.toThrow(VaultAlreadySetUpError)
  })
})

describe('the core security property', () => {
  it('data encrypted before locking cannot be read after locking, without the passphrase', async () => {
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')

    const encrypted = await vault.encryptField('Plaintiff: Maria Hartley, SSN 000-00-0000')

    vault.lock()

    // Locked: no passphrase offered at all.
    await expect(vault.decryptField(encrypted)).rejects.toThrow(VaultLockedError)
  })

  it('data cannot be read after unlocking with the WRONG passphrase', async () => {
    const { db, vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const encrypted = await vault.encryptField('Defendant: R. Cordova, DOB 1985-03-14')
    vault.lock()

    // A second service instance over the same database stands in for "re-open the
    // app": nothing is carried over in memory, only what's on disk.
    const attacker = new VaultService(db)
    await expect(attacker.unlock('a guessed passphrase')).rejects.toThrow(IncorrectPassphraseError)
    expect(attacker.isUnlocked()).toBe(false)
    await expect(attacker.decryptField(encrypted)).rejects.toThrow(VaultLockedError)
  })

  it('data IS readable again after unlocking with the CORRECT passphrase', async () => {
    const { db, vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const plaintext = 'Case No. 24CV1234 — Motion to Dismiss'
    const encrypted = await vault.encryptField(plaintext)
    vault.lock()

    const reopened = new VaultService(db)
    await reopened.unlock('correct horse battery staple')

    expect(await reopened.decryptField(encrypted)).toBe(plaintext)
  })

  it('the encrypted field never contains the plaintext as a substring', async () => {
    // This is exactly the string that would be stored in a Dexie record; there's no
    // data table to round-trip through yet (that lands in Chunk 4), so assert
    // directly on what encryptField hands back.
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const secret = 'UNREDACTED-SSN-000-00-0000'

    const encrypted = await vault.encryptField(secret)

    expect(encrypted).not.toContain(secret)
    expect(encrypted.toLowerCase()).not.toContain(secret.toLowerCase())
  })

  it('unlocking twice with the wrong passphrase does not corrupt the vault for the right one', async () => {
    const { db, vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const encrypted = await vault.encryptField('still here')
    vault.lock()

    const reopened = new VaultService(db)
    await expect(reopened.unlock('wrong 1')).rejects.toThrow(IncorrectPassphraseError)
    await expect(reopened.unlock('wrong 2')).rejects.toThrow(IncorrectPassphraseError)
    await reopened.unlock('correct horse battery staple')

    expect(await reopened.decryptField(encrypted)).toBe('still here')
  })
})

describe('encryptField / decryptField', () => {
  it('throws when the vault has never been set up and is locked', async () => {
    const { vault } = freshVault()
    await expect(vault.encryptField('anything')).rejects.toThrow(VaultLockedError)
  })

  it('round-trips unicode content', async () => {
    const { vault } = freshVault()
    await vault.setUp('passphrase')
    const text = 'Café — “quoted” — 日本語 — §430.10(e)'

    const encrypted = await vault.encryptField(text)

    expect(await vault.decryptField(encrypted)).toBe(text)
  })

  it('rejects a malformed packed field', async () => {
    const { vault } = freshVault()
    await vault.setUp('passphrase')

    await expect(vault.decryptField('not-a-valid-packed-field')).rejects.toThrow()
  })
})

describe('changePassphrase', () => {
  it('makes data readable under the new passphrase and not the old one', async () => {
    const { db, vault } = freshVault()
    await vault.setUp('old passphrase')
    const encrypted = await vault.encryptField('Discovery cutoff: 2026-11-03')

    await vault.changePassphrase('old passphrase', 'new passphrase')
    vault.lock()

    const reopened = new VaultService(db)
    await expect(reopened.unlock('old passphrase')).rejects.toThrow(IncorrectPassphraseError)

    await reopened.unlock('new passphrase')
    expect(await reopened.decryptField(encrypted)).toBe('Discovery cutoff: 2026-11-03')
  })

  it('refuses to change the passphrase without the correct current one', async () => {
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')

    await expect(vault.changePassphrase('wrong', 'new passphrase')).rejects.toThrow(
      IncorrectPassphraseError,
    )
  })

  it('throws if the vault was never set up', async () => {
    const { vault } = freshVault()
    await expect(vault.changePassphrase('a', 'b')).rejects.toThrow(VaultNotSetUpError)
  })
})

describe('unlock on a vault that was never set up', () => {
  it('throws VaultNotSetUpError', async () => {
    const { vault } = freshVault()
    await expect(vault.unlock('anything')).rejects.toThrow(VaultNotSetUpError)
  })
})

describe('encryptBinary / decryptBinary', () => {
  it('round-trips raw bytes', async () => {
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64, 10, 13])

    const field = await vault.encryptBinary(bytes)
    const decrypted = await vault.decryptBinary(field)

    expect(decrypted).toEqual(bytes)
  })

  it('produces ciphertext that does not contain the plaintext bytes', async () => {
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const plaintext = new TextEncoder().encode('DISTINCTIVE-BINARY-MARKER-000-11-2222')

    const field = await vault.encryptBinary(plaintext)

    const asLatin1 = Buffer.from(field.ciphertext).toString('latin1')
    expect(asLatin1).not.toContain('DISTINCTIVE-BINARY-MARKER')
  })

  it('throws VaultLockedError when locked', async () => {
    const { vault } = freshVault()
    await expect(vault.encryptBinary(new Uint8Array([1, 2, 3]))).rejects.toThrow(VaultLockedError)
  })

  it('rejects decryption under a DEK from an entirely different vault', async () => {
    const { vault } = freshVault()
    await vault.setUp('correct horse battery staple')
    const field = await vault.encryptBinary(new Uint8Array([9, 9, 9]))

    // A second, independent database/vault — its own random DEK, unrelated to the
    // first. Proves decryption is bound to the specific key, not just "some vault
    // happens to be unlocked."
    const { vault: unrelatedVault } = freshVault()
    await unrelatedVault.setUp('a completely unrelated passphrase')

    await expect(unrelatedVault.decryptBinary(field)).rejects.toThrow()
  })
})
