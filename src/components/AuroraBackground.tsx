import styles from './AuroraBackground.module.css'

/**
 * The three soft, slowly-drifting color blobs plus faint grid overlay that sit
 * behind every screen in the mockup. Fixed behind the content so it doesn't repaint
 * or scroll per-screen.
 */
export function AuroraBackground() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.blob} ${styles.blobA}`} />
      <div className={`${styles.blob} ${styles.blobB}`} />
      <div className={`${styles.blob} ${styles.blobC}`} />
      <div className={styles.grid} />
    </div>
  )
}
