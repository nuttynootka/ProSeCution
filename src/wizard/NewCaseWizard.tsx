import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { caseRepository, partyRepository } from '../cases'
import { checkFeeWaiverEligibility } from '../feeWaiver'
import { PrimaryButton } from './PrimaryButton'
import { WizardShell } from './WizardShell'
import { CaseDetailsStep } from './steps/CaseDetailsStep'
import { FeeWaiverStep } from './steps/FeeWaiverStep'
import { JurisdictionStep } from './steps/JurisdictionStep'
import { TopicsStep } from './steps/TopicsStep'

const STEP_TITLES = ['Jurisdiction', 'Case details', 'Topics & documents', 'Fee waiver']

interface WizardData {
  state: string | null
  county: string
  caseType: string | null
  plaintiffName: string
  defendantName: string
  feeWaiverChoice: 'yes' | 'not_now' | null
  feeWaiverHouseholdSize: string
  feeWaiverAnnualIncome: string
  feeWaiverReceivesPublicBenefits: boolean
}

const EMPTY: WizardData = {
  state: null,
  county: '',
  caseType: null,
  plaintiffName: '',
  defendantName: '',
  feeWaiverChoice: null,
  feeWaiverHouseholdSize: '1',
  feeWaiverAnnualIncome: '',
  feeWaiverReceivesPublicBenefits: false,
}

function canContinue(step: number, data: WizardData): boolean {
  if (step === 0) return data.state !== null && data.county.trim().length > 0
  if (step === 1) {
    return data.caseType !== null && data.plaintiffName.trim().length > 0 && data.defendantName.trim().length > 0
  }
  return true // steps 2 and 3 are stubs with nothing required
}

export function NewCaseWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const patch = (fields: Partial<WizardData>) => setData((prev) => ({ ...prev, ...fields }))

  const handleBack = () => {
    if (step === 0) navigate('/cases')
    else setStep((s) => s - 1)
  }

  const handleCreate = async () => {
    if (!data.state || !data.caseType) return // guarded by canContinue on earlier steps
    setSubmitError(null)
    setSubmitting(true)
    try {
      const hasEnteredIncome = data.feeWaiverAnnualIncome.trim() !== ''
      const wantsFeeWaiverCheck =
        data.feeWaiverChoice === 'yes' && (hasEnteredIncome || data.feeWaiverReceivesPublicBenefits)
      const feeWaiverFields = wantsFeeWaiverCheck
        ? (() => {
            const householdSize = Math.max(1, Math.floor(Number(data.feeWaiverHouseholdSize)) || 1)
            const annualIncome = Math.max(0, Number(data.feeWaiverAnnualIncome) || 0)
            const result = checkFeeWaiverEligibility(data.state!, {
              householdSize,
              annualIncome,
              receivesPublicBenefits: data.feeWaiverReceivesPublicBenefits,
            })
            return {
              feeWaiverStatus: result.eligibility,
              feeWaiverHouseholdSize: householdSize,
              feeWaiverAnnualIncome: annualIncome,
              feeWaiverReceivesPublicBenefits: data.feeWaiverReceivesPublicBenefits,
            }
          })()
        : {}

      const created = await caseRepository.create({
        state: data.state,
        county: data.county.trim(),
        caseType: data.caseType,
        ...feeWaiverFields,
      })
      await partyRepository.create(created.id, { name: data.plaintiffName.trim(), role: 'plaintiff' })
      await partyRepository.create(created.id, { name: data.defendantName.trim(), role: 'defendant' })
      navigate('/cases')
    } catch {
      setSubmitError('Could not create the case. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const stepIsValid = canContinue(step, data)

  return (
    <WizardShell
      stepIndex={step}
      stepCount={4}
      title={STEP_TITLES[step]}
      onBack={handleBack}
      footer={
        step < 3 ? (
          <PrimaryButton
            disabled={!stepIsValid}
            onClick={() => setStep((s) => s + 1)}
            data-testid="wizard-continue"
          >
            Continue
          </PrimaryButton>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {submitError && (
              <div role="alert" style={{ font: '500 12px/1.4 var(--plcm-font-sans)', color: '#fca5a5' }}>
                {submitError}
              </div>
            )}
            <PrimaryButton disabled={submitting} onClick={handleCreate} data-testid="wizard-create">
              {submitting ? 'Creating…' : 'Create case'}
            </PrimaryButton>
          </div>
        )
      }
    >
      {step === 0 && (
        <JurisdictionStep
          state={data.state}
          county={data.county}
          onStateChange={(state) => patch({ state })}
          onCountyChange={(county) => patch({ county })}
        />
      )}
      {step === 1 && (
        <CaseDetailsStep
          caseType={data.caseType}
          plaintiffName={data.plaintiffName}
          defendantName={data.defendantName}
          onCaseTypeChange={(caseType) => patch({ caseType })}
          onPlaintiffNameChange={(plaintiffName) => patch({ plaintiffName })}
          onDefendantNameChange={(defendantName) => patch({ defendantName })}
        />
      )}
      {step === 2 && <TopicsStep />}
      {step === 3 && (
        <FeeWaiverStep
          state={data.state}
          choice={data.feeWaiverChoice}
          householdSize={data.feeWaiverHouseholdSize}
          annualIncome={data.feeWaiverAnnualIncome}
          receivesPublicBenefits={data.feeWaiverReceivesPublicBenefits}
          onChoiceChange={(feeWaiverChoice) => patch({ feeWaiverChoice })}
          onHouseholdSizeChange={(feeWaiverHouseholdSize) => patch({ feeWaiverHouseholdSize })}
          onAnnualIncomeChange={(feeWaiverAnnualIncome) => patch({ feeWaiverAnnualIncome })}
          onReceivesPublicBenefitsChange={(feeWaiverReceivesPublicBenefits) => patch({ feeWaiverReceivesPublicBenefits })}
        />
      )}
    </WizardShell>
  )
}
