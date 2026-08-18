import { GlassSurface } from '../../components/GlassSurface'
import { checkFeeWaiverEligibility, type FeeWaiverEligibility } from '../../feeWaiver'
import { ChipGroup } from '../ChipGroup'
import { SectionLabel, TextInput } from '../Field'

interface FeeWaiverStepProps {
  /** The wizard's already-selected jurisdiction (step 1) — the same key the eligibility engine looks its rules up by. */
  state: string | null
  choice: 'yes' | 'not_now' | null
  householdSize: string
  annualIncome: string
  receivesPublicBenefits: boolean
  onChoiceChange: (choice: 'yes' | 'not_now') => void
  onHouseholdSizeChange: (value: string) => void
  onAnnualIncomeChange: (value: string) => void
  onReceivesPublicBenefitsChange: (value: boolean) => void
}

const RESULT_TONE: Record<FeeWaiverEligibility, string> = {
  eligible: '#86efac',
  not_eligible: '#fca5a5',
  undetermined: 'var(--plcm-purple-light)',
}

const RESULT_LABEL: Record<FeeWaiverEligibility, string> = {
  eligible: 'Likely eligible',
  not_eligible: 'Likely not eligible',
  undetermined: 'Undetermined',
}

/**
 * Real computation (Chunk 24's engine) now, not the earlier stub — but the choice
 * to even attempt it stays opt-in ("Yes, check" / "Not now"), so skipping this step
 * remains exactly as easy as it always was. A purely controlled/presentational
 * component, same pattern as CaseDetailsStep: the wizard owns every field's value
 * and re-derives the eligibility result for display on every render — cheap, pure,
 * and needs no effect/callback-lifting, since the actual value that gets persisted
 * is computed once, at case-creation time, from these same raw inputs.
 */
export function FeeWaiverStep({
  state,
  choice,
  householdSize,
  annualIncome,
  receivesPublicBenefits,
  onChoiceChange,
  onHouseholdSizeChange,
  onAnnualIncomeChange,
  onReceivesPublicBenefitsChange,
}: FeeWaiverStepProps) {
  const parsedHouseholdSize = Math.max(1, Math.floor(Number(householdSize)) || 1)
  const parsedAnnualIncome = Math.max(0, Number(annualIncome) || 0)
  const hasEnteredIncome = annualIncome.trim() !== ''

  const liveResult =
    choice === 'yes' && (hasEnteredIncome || receivesPublicBenefits)
      ? checkFeeWaiverEligibility(state ?? '', {
          householdSize: parsedHouseholdSize,
          annualIncome: parsedAnnualIncome,
          receivesPublicBenefits,
        })
      : null

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ font: '600 13.5px/1.4 var(--plcm-font-sans)', color: 'var(--plcm-heading)' }}>
        Check fee waiver eligibility?
      </div>
      <p style={{ margin: 0, font: '400 11.5px/1.55 var(--plcm-font-sans)', color: 'var(--plcm-text-dim)' }}>
        Based on your household income, the court may waive filing fees.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChoiceChange('yes')}
          data-testid="fee-waiver-yes"
          style={{
            flex: 1,
            padding: '11px',
            borderRadius: 'var(--plcm-radius-lg)',
            cursor: 'pointer',
            font: '600 12.5px/1 var(--plcm-font-sans)',
            background: choice === 'yes' ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'rgba(255,255,255,0.05)',
            color: choice === 'yes' ? '#fff' : 'var(--plcm-text)',
            border: '1px solid var(--plcm-glass-border)',
          }}
        >
          Yes, check
        </button>
        <button
          type="button"
          onClick={() => onChoiceChange('not_now')}
          data-testid="fee-waiver-not-now"
          style={{
            flex: 1,
            padding: '11px',
            borderRadius: 'var(--plcm-radius-lg)',
            cursor: 'pointer',
            font: '600 12.5px/1 var(--plcm-font-sans)',
            background: choice === 'not_now' ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'rgba(255,255,255,0.05)',
            color: choice === 'not_now' ? '#fff' : 'var(--plcm-text)',
            border: '1px solid var(--plcm-glass-border)',
          }}
        >
          Not now
        </button>
      </div>

      {choice === 'yes' && (
        <>
          <SectionLabel>Household size</SectionLabel>
          <TextInput
            type="number"
            min={1}
            value={householdSize}
            onChange={(e) => onHouseholdSizeChange(e.target.value)}
            data-testid="fee-waiver-household-size"
          />

          <SectionLabel>Annual household income</SectionLabel>
          <TextInput
            type="number"
            min={0}
            value={annualIncome}
            onChange={(e) => onAnnualIncomeChange(e.target.value)}
            placeholder="e.g. 25000"
            data-testid="fee-waiver-annual-income"
          />

          <ChipGroup
            groupLabel="fee-waiver-benefits"
            options={[
              { value: 'no', label: "I don't receive public benefits" },
              { value: 'yes', label: 'I receive public benefits' },
            ]}
            value={receivesPublicBenefits ? 'yes' : 'no'}
            onChange={(value) => onReceivesPublicBenefitsChange(value === 'yes')}
          />

          {liveResult && (
            <div
              data-testid="fee-waiver-result"
              data-eligibility={liveResult.eligibility}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--plcm-radius-sm)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--plcm-glass-border)',
              }}
            >
              <div style={{ font: '700 12.5px/1.3 var(--plcm-font-sans)', color: RESULT_TONE[liveResult.eligibility] }}>
                {RESULT_LABEL[liveResult.eligibility]}
              </div>
              {liveResult.ruleCitation && (
                <div
                  style={{
                    marginTop: 4,
                    font: '600 10px/1.3 var(--plcm-font-mono)',
                    letterSpacing: '0.03em',
                    color: 'var(--plcm-text-faint)',
                  }}
                >
                  {liveResult.ruleCitation}
                </div>
              )}
              <p style={{ margin: '6px 0 0', font: '400 11.5px/1.5 var(--plcm-font-sans)', color: 'var(--plcm-text-dim)' }}>
                {liveResult.explanation}
              </p>
            </div>
          )}
        </>
      )}
    </GlassSurface>
  )
}
