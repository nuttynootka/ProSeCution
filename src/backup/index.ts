import { db, vault } from '../vault'
import { decryptBackupFile, encryptBackupFile } from './backupFile'
import { backupFilename, triggerBackupDownload } from './download'
import { createBackupManifest, restoreBackupManifest } from './manifest'

export { IncorrectBackupPassphraseError, InvalidBackupFileError } from './backupFile'
export { backupFilename } from './download'
export type { BackupManifest } from './types'

/** Dumps the app's real data, encrypts it under the given passphrase, and triggers a real file download — the one call a Settings/Vault screen needs for "Export encrypted backup." */
export async function exportBackup(passphrase: string): Promise<void> {
  const manifest = await createBackupManifest(db, vault)
  const fileBytes = await encryptBackupFile(manifest, passphrase)
  triggerBackupDownload(backupFilename(), fileBytes)
}

/**
 * Decrypts an uploaded `.plcmbackup` file and writes its contents into the app's
 * real, currently-unlocked vault. Requires a vault to already exist and be
 * unlocked — restoring imports content *into* it, re-encrypted under its own DEK,
 * rather than creating a new vault from the backup's own passphrase. Those two
 * passphrases (the one that protected the backup file, and the one protecting this
 * device's vault) are allowed to be different — a real, useful case (restoring
 * onto a new device where the user chooses a fresh vault passphrase).
 */
export async function importBackup(fileBytes: Uint8Array, backupPassphrase: string): Promise<void> {
  const manifest = await decryptBackupFile(fileBytes, backupPassphrase)
  await restoreBackupManifest(manifest, db, vault)
}
