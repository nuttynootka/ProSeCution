import type { ReactNode } from 'react'
import styles from './WizardShell.module.css'

interface WizardShellProps {
  stepIndex: number
  stepCount: number
  title: string
  onBack: () => void
  footer: ReactNode
  children: ReactNode
}

/** Header (back + kicker + step title), progress dots, and footer chrome shared by every wizard step. */
export function WizardShell({ stepIndex, stepCount, title, onBack, footer, children }: WizardShellProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back" data-testid="wizard-back">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M9.5 2.5L4 7.5L9.5 12.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div>
          <div className={styles.kicker}>NEW CASE</div>
          <div className={styles.title}>{title}</div>
        </div>
      </div>

      <div className={styles.dots}>
        {Array.from({ length: stepCount }, (_, i) => (
          <div key={i} className={i <= stepIndex ? `${styles.dot} ${styles.dotFilled}` : styles.dot} />
        ))}
      </div>

      <div className={styles.content} data-testid={`wizard-step-${stepIndex}`}>
        {children}
      </div>

      <div className={styles.footer}>{footer}</div>
    </div>
  )
}
