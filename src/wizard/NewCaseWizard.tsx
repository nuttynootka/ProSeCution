import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { caseRepository, partyRepository } from '../cases'
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
}

const EMPTY: WizardData = { state: null, county: '', caseType: null, plaintiffName: '', defendantName: '' }

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
      const created = await caseRepository.create({
        state: data.state,
        county: data.county.trim(),
        caseType: data.caseType,
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
      {step === 3 && <FeeWaiverStep />}
    </WizardShell>
  )
}
