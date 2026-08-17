import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { GlassSurface } from '../components/GlassSurface'
import { IncorrectPassphraseError } from './crypto'
import { vault } from './index'
import styles from './PassphraseGate.module.css'

const MIN_PASSPHRASE_LENGTH = 12

type Status =
  | { kind: 'checking' }
  | { kind: 'needs-setup' }
  | { kind: 'locked' }
  | { kind: 'unlocked' }

/**
 * Nothing in the app can read or write a single field without the vault unlocked, so
 * this sits above the router and everything waits behind it. There's no dedicated
 * chunk for this in the plan — it surfaced as a hard blocker while building the New
 * Case Wizard (Chunk 5), which is the first thing that actually needs to write
 * encrypted data. This is deliberately minimal: passphrase setup and unlock only.
 * Change-passphrase, lock-on-demand, and the rest of vault management are Chunk 28's
 * Settings screen, not this.
 */
export function PassphraseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: 'checking' })

  useEffect(() => {
    vault.isSetUp().then((setUp) => setStatus({ kind: setUp ? 'locked' : 'needs-setup' }))
  }, [])

  if (status.kind === 'checking') return null
  if (status.kind === 'unlocked') return <>{children}</>

  return (
    <div className={styles.backdrop}>
      <GlassSurface className={styles.card} variant="accent">
        {status.kind === 'needs-setup' ? (
          <SetUpForm onDone={() => setStatus({ kind: 'unlocked' })} />
        ) : (
          <UnlockForm onDone={() => setStatus({ kind: 'unlocked' })} />
        )}
      </GlassSurface>
    </div>
  )
}

function SetUpForm({ onDone }: { onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`)
      return
    }
    if (passphrase !== confirm) {
      setError('Passphrases do not match.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await vault.setUp(passphrase)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.kicker}>SET UP</div>
      <h1 className={styles.title}>Create your passphrase</h1>
      <p className={styles.body}>
        Everything you enter — case details, documents, drafts — is encrypted on this
        device with this passphrase. There is no password reset and no cloud recovery:
        if it's lost, the data is unrecoverable. Write it down somewhere safe.
      </p>

      <label className={styles.label} htmlFor="passphrase">
        Passphrase
      </label>
      <input
        id="passphrase"
        type="password"
        autoComplete="new-password"
        className={styles.input}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        data-testid="setup-passphrase"
      />

      <label className={styles.label} htmlFor="confirm">
        Confirm passphrase
      </label>
      <input
        id="confirm"
        type="password"
        autoComplete="new-password"
        className={styles.input}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        data-testid="setup-confirm"
      />

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <button type="submit" className={styles.submit} disabled={busy} data-testid="setup-submit">
        {busy ? 'Setting up…' : 'Create vault'}
      </button>
    </form>
  )
}

function UnlockForm({ onDone }: { onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await vault.unlock(passphrase)
      onDone()
    } catch (err) {
      setError(err instanceof IncorrectPassphraseError ? 'Incorrect passphrase.' : 'Could not unlock.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.kicker}>WELCOME BACK</div>
      <h1 className={styles.title}>Enter your passphrase</h1>

      <label className={styles.label} htmlFor="unlock-passphrase">
        Passphrase
      </label>
      <input
        id="unlock-passphrase"
        type="password"
        autoComplete="current-password"
        className={styles.input}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoFocus
        data-testid="unlock-passphrase"
      />

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <button type="submit" className={styles.submit} disabled={busy} data-testid="unlock-submit">
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  )
}
