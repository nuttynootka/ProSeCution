import { describe, expect, it } from 'vitest'
import {
  decryptBackupFile,
  encryptBackupFile,
  IncorrectBackupPassphraseError,
  InvalidBackupFileError,
} from './backupFile'
import { BACKUP_MANIFEST_VERSION, type BackupManifest } from './types'

const SAMPLE_MANIFEST: BackupManifest = {
  version: BACKUP_MANIFEST_VERSION,
  createdAt: Date.UTC(2026, 2, 1),
  cases: [{ id: 'c1', createdAt: 1, updatedAt: 1, content: { state: 'CA', county: 'Los Angeles', caseType: 'Civil', currentStage: 'pleadings' } }],
  parties: [],
  documents: [],
  deadlines: [],
  pdfTemplates: [],
  fieldMappings: [],
  proofOfService: [],
}

describe('encryptBackupFile / decryptBackupFile', () => {
  it('round-trips the exact manifest under the correct passphrase', async () => {
    const bytes = await encryptBackupFile(SAMPLE_MANIFEST, 'correct horse battery staple')
    const restored = await decryptBackupFile(bytes, 'correct horse battery staple')
    expect(restored).toEqual(SAMPLE_MANIFEST)
  })

  it('produces real, plain JSON on disk — the salt and ciphertext are readable, but not the case data itself', async () => {
    const bytes = await encryptBackupFile(SAMPLE_MANIFEST, 'correct horse battery staple')
    const text = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(text)
    expect(typeof parsed.salt).toBe('string')
    expect(typeof parsed.ciphertext).toBe('string')
    expect(text).not.toContain('Los Angeles')
  })

  it('rejects the wrong passphrase with a clear, specific error', async () => {
    const bytes = await encryptBackupFile(SAMPLE_MANIFEST, 'correct horse battery staple')
    await expect(decryptBackupFile(bytes, 'wrong passphrase')).rejects.toBeInstanceOf(IncorrectBackupPassphraseError)
  })

  it('rejects a file that is not valid backup JSON at all', async () => {
    const bytes = new TextEncoder().encode('not a backup file')
    await expect(decryptBackupFile(bytes, 'anything')).rejects.toBeInstanceOf(InvalidBackupFileError)
  })

  it('rejects a tampered ciphertext instead of returning corrupted data', async () => {
    const bytes = await encryptBackupFile(SAMPLE_MANIFEST, 'correct horse battery staple')
    const file = JSON.parse(new TextDecoder().decode(bytes))
    file.ciphertext = file.ciphertext.slice(0, -4) + 'AAAA'
    const tampered = new TextEncoder().encode(JSON.stringify(file))
    await expect(decryptBackupFile(tampered, 'correct horse battery staple')).rejects.toBeInstanceOf(IncorrectBackupPassphraseError)
  })
})
