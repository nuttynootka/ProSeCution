import styles from './DisclaimerBanner.module.css'

export const DEFAULT_AI_DISCLAIMER =
  'AI-generated content may be incorrect or incomplete. This is not legal advice, and no attorney has reviewed it. Verify everything against your own facts and records before relying on or filing it.'

interface DisclaimerBannerProps {
  text?: string
}

/**
 * The blueprint's "permanent disclaimer banner on AI screens" — reusable and
 * parameterizable so a specific screen (Agent A's Q&A, Agent D's drafting
 * workbench, Stage 9/10) can add its own detail, but every one of them gets the
 * same baseline warning by default. No screen renders this yet; see AdoptionGate's
 * doc comment for why building it now, ahead of its consumers, is the same pattern
 * already used for storage (Chunk 7) and OCR (Chunk 9) infra.
 */
export function DisclaimerBanner({ text = DEFAULT_AI_DISCLAIMER }: DisclaimerBannerProps) {
  return (
    <div className={styles.banner} role="note" data-testid="upl-disclaimer-banner">
      <svg className={styles.icon} width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path
          d="M7.5 1.5 1 13h13L7.5 1.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M7.5 6v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7.5" cy="11" r="0.75" fill="currentColor" />
      </svg>
      <p className={styles.text}>{text}</p>
    </div>
  )
}
