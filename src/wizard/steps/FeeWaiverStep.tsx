import { useState } from 'react'
import { GlassSurface } from '../../components/GlassSurface'
import { PrimaryButton } from '../PrimaryButton'

/**
 * Same honest-stub approach as TopicsStep: the choice is interactive (it highlights)
 * so the step doesn't feel broken, but it's not persisted — real eligibility
 * calculation against state income thresholds is Chunk 24's job, and CaseContent has
 * no field for it yet.
 */
export function FeeWaiverStep() {
  const [choice, setChoice] = useState<'yes' | 'not_now' | null>(null)

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ font: '600 13.5px/1.4 var(--plcm-font-sans)', color: 'var(--plcm-heading)' }}>
        Check fee waiver eligibility?
      </div>
      <p style={{ margin: 0, font: '400 11.5px/1.55 var(--plcm-font-sans)', color: 'var(--plcm-text-dim)' }}>
        Based on your household income, the court may waive filing fees.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <PrimaryButton
          variant={choice === 'yes' ? 'primary' : 'secondary'}
          onClick={() => setChoice('yes')}
          data-testid="fee-waiver-yes"
        >
          Yes, check
        </PrimaryButton>
        <PrimaryButton
          variant={choice === 'not_now' ? 'primary' : 'secondary'}
          onClick={() => setChoice('not_now')}
          data-testid="fee-waiver-not-now"
        >
          Not now
        </PrimaryButton>
      </div>
      {choice === 'yes' && (
        <p style={{ margin: 0, font: '500 11.5px/1.5 var(--plcm-font-sans)', color: 'var(--plcm-purple-light)' }}>
          Fee waiver assistance arrives in a later update — your case will still be
          created.
        </p>
      )}
    </GlassSurface>
  )
}
