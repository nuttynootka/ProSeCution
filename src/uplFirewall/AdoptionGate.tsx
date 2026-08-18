import { useState } from 'react'
import { PrimaryButton } from '../wizard/PrimaryButton'
import styles from './AdoptionGate.module.css'

export interface AdoptionGateProps {
  /** What's being adopted, e.g. "Motion to Compel Discovery". */
  title: string
  /** Why adoption matters for this specific document — the caller's context, not a generic disclaimer (that's DisclaimerBanner's job). */
  description: string
  onAdopt: () => void
  onCancel: () => void
}

/**
 * The blueprint's UPL-firewall "adoption step": a full-screen overlay a user must
 * actively check off before an AI-drafted document can be finalized/exported. No
 * consumer wires this yet — Stage 9/10's AI drafting features (Agent D, Chunk 43)
 * are what will actually produce content that needs gating this way. Built now,
 * ahead of that consumer, the same "infra now, wire later" precedent Chunks 7 and 9
 * already used for storage and OCR before anything called them.
 *
 * The premise this exists to enforce: an AI-drafted legal document is a *draft*
 * someone else wrote, not this user's own work, until a real person reviews it and
 * takes ownership. Skipping that step and filing it as-is risks exactly the kind of
 * unauthorized-practice-of-law problem this gate exists to prevent — so adoption is
 * a deliberate, one-at-a-time, can't-be-automated checkbox, not a "don't show this
 * again" setting.
 */
export function AdoptionGate({ title, description, onAdopt, onCancel }: AdoptionGateProps) {
  const [checked, setChecked] = useState(false)

  return (
    <div className={styles.root} data-testid="upl-adoption-gate">
      <div className={styles.card}>
        <div className={styles.kicker}>REVIEW BEFORE ADOPTING</div>
        <div className={styles.title}>{title}</div>
        <p className={styles.description}>{description}</p>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            data-testid="upl-adoption-checkbox"
          />
          <span className={styles.checkboxLabel}>
            I have reviewed this document, verified it against my own facts and records, and I am adopting it as my
            own work — not relying on it as legal advice.
          </span>
        </label>

        <div className={styles.actions}>
          <PrimaryButton variant="secondary" onClick={onCancel} data-testid="upl-adoption-cancel">
            Cancel
          </PrimaryButton>
          <PrimaryButton onClick={onAdopt} disabled={!checked} data-testid="upl-adoption-confirm">
            Adopt & continue
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
