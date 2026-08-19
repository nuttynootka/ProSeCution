import { useRef, useState } from 'react'
import { exportBackup, importBackup, IncorrectBackupPassphraseError, InvalidBackupFileError } from '../backup'
import { GlassSurface } from '../components/GlassSurface'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './VaultScreen.module.css'

type ExportPhase = 'idle' | 'exporting' | 'done' | 'error'
type ImportPhase = 'idle' | 'importing' | 'done' | 'error'

/**
 * Encrypted backup/restore (Chunk 26), the first real content here — everything
 * else the blueprint puts on this screen (storage status, persistence grant,
 * lock/unlock, offline state) is Chunk 28's job. `PlaceholderScreen` said as much
 * before this chunk; the honest-stub pattern replaced piece by piece, same as
 * DocumentReviewScreen's redaction card (Chunk 22) and template card.
 */
export function VaultScreen() {
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle')
  const [exportError, setExportError] = useState<string | null>(null)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPassphrase, setImportPassphrase] = useState('')
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    if (!exportPassphrase) return
    setExportPhase('exporting')
    setExportError(null)
    try {
      await exportBackup(exportPassphrase)
      setExportPhase('done')
    } catch {
      setExportError('Could not create a backup. Please try again.')
      setExportPhase('error')
    }
  }

  const handleImport = async () => {
    if (!importFile || !importPassphrase) return
    setImportPhase('importing')
    setImportError(null)
    try {
      const bytes = new Uint8Array(await importFile.arrayBuffer())
      await importBackup(bytes, importPassphrase)
      setImportPhase('done')
    } catch (err) {
      if (err instanceof IncorrectBackupPassphraseError) {
        setImportError('Incorrect passphrase for this backup file.')
      } else if (err instanceof InvalidBackupFileError) {
        setImportError('This does not look like a valid backup file.')
      } else {
        setImportError('Could not restore this backup. Please try again.')
      }
      setImportPhase('error')
    }
  }

  return (
    <div className={styles.root} data-testid="screen-vault">
      <div className={styles.header}>
        <div className={styles.kicker}>VAULT</div>
        <div className={styles.title}>Vault</div>
      </div>

      <div className={styles.body}>
        <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Export encrypted backup</SectionLabel>
          <p className={styles.note}>
            Downloads every case, document, and draft on this device as one AES-256-GCM-encrypted file, protected by
            a passphrase you choose now — it doesn't have to match your vault passphrase, and can be restored on a
            different device.
          </p>
          <TextInput
            type="password"
            placeholder="Backup passphrase"
            value={exportPassphrase}
            onChange={(e) => setExportPassphrase(e.target.value)}
            data-testid="backup-export-passphrase"
          />
          {exportError && (
            <div className={styles.errorBanner} role="alert" data-testid="backup-export-error">
              {exportError}
            </div>
          )}
          {exportPhase === 'done' && (
            <div className={styles.successBanner} data-testid="backup-export-success">
              Backup downloaded.
            </div>
          )}
          <PrimaryButton
            disabled={!exportPassphrase || exportPhase === 'exporting'}
            onClick={() => void handleExport()}
            data-testid="backup-export-submit"
          >
            {exportPhase === 'exporting' ? 'Creating backup…' : 'Download backup'}
          </PrimaryButton>
        </GlassSurface>

        <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Restore from backup</SectionLabel>
          <p className={styles.note}>
            Imports a backup file into this vault. Existing data with the same ids is overwritten; nothing else is
            removed.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".plcmbackup,application/json"
            className={styles.fileInput}
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            data-testid="backup-import-file"
          />
          <TextInput
            type="password"
            placeholder="Backup's passphrase"
            value={importPassphrase}
            onChange={(e) => setImportPassphrase(e.target.value)}
            data-testid="backup-import-passphrase"
          />
          {importError && (
            <div className={styles.errorBanner} role="alert" data-testid="backup-import-error">
              {importError}
            </div>
          )}
          {importPhase === 'done' && (
            <div className={styles.successBanner} data-testid="backup-import-success">
              Backup restored.
            </div>
          )}
          <PrimaryButton
            disabled={!importFile || !importPassphrase || importPhase === 'importing'}
            onClick={() => void handleImport()}
            data-testid="backup-import-submit"
          >
            {importPhase === 'importing' ? 'Restoring…' : 'Restore backup'}
          </PrimaryButton>
        </GlassSurface>
      </div>
    </div>
  )
}
