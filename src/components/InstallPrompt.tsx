import { useEffect, useState } from 'react'
import { GlassSurface } from './GlassSurface'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { SectionLabel } from '../wizard/Field'
import styles from './InstallPrompt.module.css'

/** Not in any TS DOM lib yet — a real, standard event (`beforeinstallprompt`), just not one TypeScript ships types for. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Chunk 51's "install polish": the browser's own native install affordance
 * (address-bar icon on desktop Chrome, an automatic banner on some Android Chrome
 * versions) already works once the manifest/service worker/icons are all valid —
 * which they already are as of Chunk 1 — so this isn't required for installability.
 * It exists because that native UI is easy to miss entirely; a real, in-app,
 * dismissible card is more discoverable. If the browser never fires
 * `beforeinstallprompt` (already installed, Android Chrome versions that skip it in
 * favor of their own automatic banner, or — the common case in automated testing —
 * a Chromium instance that doesn't fire it at all), this renders nothing rather
 * than a button that can't actually do anything, the same "no signal, no fabricated
 * affordance" pattern the rest of this app follows.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!event || dismissed || installed) return null

  const handleInstall = async () => {
    await event.prompt()
    const choice = await event.userChoice
    // Both outcomes consume the event — Chrome only fires beforeinstallprompt
    // again after a fresh page load, never a second time in the same session.
    setEvent(null)
    if (choice.outcome !== 'accepted') setDismissed(true)
  }

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="install-prompt">
      <SectionLabel>Install this app</SectionLabel>
      <p className={styles.note}>
        Add Pro Se Legal Case Manager to your home screen for one-tap access and full offline use — your data stays
        on this device either way.
      </p>
      <div className={styles.actions}>
        <PrimaryButton variant="secondary" onClick={() => setDismissed(true)} data-testid="install-prompt-dismiss">
          Not now
        </PrimaryButton>
        <PrimaryButton onClick={() => void handleInstall()} data-testid="install-prompt-install">
          Install
        </PrimaryButton>
      </div>
    </GlassSurface>
  )
}
