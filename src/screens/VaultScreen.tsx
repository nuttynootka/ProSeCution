import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup, IncorrectBackupPassphraseError, InvalidBackupFileError } from '../backup'
import { GlassSurface } from '../components/GlassSurface'
import { LlmProviderSettingsCard } from '../llm/LlmProviderSettingsCard'
import {
  estimateStorageUsage,
  formatBytes,
  isStoragePersisted,
  requestPersistentStorage,
  type StorageEstimate,
} from '../vault/storagePersistence'
import { vault } from '../vault'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './VaultScreen.module.css'

type ExportPhase = 'idle' | 'exporting' | 'done' | 'error'
type ImportPhase = 'idle' | 'importing' | 'done' | 'error'

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

/**
 * Encrypted backup/restore (Chunk 26) plus this chunk's storage status,
 * persistence grant, lock, and offline state — the full set the blueprint puts on
 * this screen. `PlaceholderScreen` said as much before Chunk 26 started filling it
 * in; the honest-stub pattern replaced piece by piece, same as
 * DocumentReviewScreen's redaction card (Chunk 22) and template card.
 */
export function VaultScreen() {
  const online = useOnlineStatus()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [persistRequesting, setPersistRequesting] = useState(false)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
    estimateStorageUsage().then(setEstimate)
  }, [])

  const handleRequestPersistence = async () => {
    setPersistRequesting(true)
    try {
      const granted = await requestPersistentStorage()
      setPersisted(granted)
    } finally {
      setPersistRequesting(false)
    }
  }

  const handleLock = () => {
    vault.lock()
    // A full reload, not just a state flip: PassphraseGate only decides
    // locked-vs-unlocked once, on mount — reloading is what makes it re-run that
    // check against the now-locked vault and show the unlock screen for real,
    // rather than trusting client state to remember a lock happened elsewhere.
    window.location.reload()
  }

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
          <SectionLabel>Status</SectionLabel>
          <div className={styles.statusRow}>
            <span className={online ? styles.statusOk : styles.statusWarn} data-testid="online-status">
              {online ? 'Online' : 'Offline'}
            </span>
            <span className={persisted ? styles.statusOk : styles.statusWarn} data-testid="persistence-status">
              {persisted === null ? 'Checking storage…' : persisted ? 'Storage persisted' : 'Storage not persisted'}
            </span>
          </div>
          {estimate && (
            <p className={styles.note} data-testid="storage-estimate">
              Using {formatBytes(estimate.usageBytes)} of {formatBytes(estimate.quotaBytes)} available.
            </p>
          )}
          {persisted === false && (
            <>
              <p className={styles.note}>
                Without persistent storage, the browser can clear this app's data under storage pressure — including
                everything in your vault. Request persistence to make that far less likely.
              </p>
              <PrimaryButton
                variant="secondary"
                disabled={persistRequesting}
                onClick={() => void handleRequestPersistence()}
                data-testid="request-persistence"
              >
                {persistRequesting ? 'Requesting…' : 'Request persistent storage'}
              </PrimaryButton>
            </>
          )}
          <PrimaryButton variant="secondary" onClick={handleLock} data-testid="lock-vault">
            Lock vault
          </PrimaryButton>
        </GlassSurface>

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
            aria-label="Choose a backup file to restore"
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

        <LlmProviderSettingsCard />
      </div>
    </div>
  )
}
