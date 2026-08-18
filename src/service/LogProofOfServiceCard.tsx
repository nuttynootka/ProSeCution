import { useEffect, useState } from 'react'
import { partyRepository, type Party } from '../cases'
import { GlassSurface } from '../components/GlassSurface'
import { deadlineRepository, type Deadline } from '../deadlines'
import { loadFillFont, pdfFilename, triggerPdfDownload } from '../pdf'
import { ChipGroup } from '../wizard/ChipGroup'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { generateCertificateOfService } from './certificateOfService'
import { logProofOfService, type LogProofOfServiceResult } from './logProofOfService'
import { proofOfServiceDeps } from './index'
import type { ServiceMethod } from './types'
import styles from './LogProofOfServiceCard.module.css'

const SERVICE_METHOD_OPTIONS: { value: ServiceMethod; label: string }[] = [
  { value: 'mail', label: 'Mail' },
  { value: 'personal', label: 'Personal' },
  { value: 'electronic', label: 'Electronic' },
]

interface FormState {
  partyId: string
  documentDescription: string
  serviceMethod: ServiceMethod
  serviceDate: string
  serviceAddress: string
  linkedDeadlineId: string // '' means none
}

const EMPTY_FORM: FormState = {
  partyId: '',
  documentDescription: '',
  serviceMethod: 'mail',
  serviceDate: '',
  serviceAddress: '',
  linkedDeadlineId: '',
}

type Step =
  | { step: 'closed' }
  | { step: 'open'; form: FormState }
  | { step: 'submitting'; form: FormState }
  | { step: 'result'; result: LogProofOfServiceResult; form: FormState }
  | { step: 'error' }

interface LogProofOfServiceCardProps {
  caseId: string
  caseLabel: string
  onLogged: (result: LogProofOfServiceResult) => void
}

/**
 * The blueprint's "Add Proof of Service" action, scoped to a single reviewable
 * surface (a case-dashboard card, alongside LogServiceDateCard) rather than spread
 * across the cross-case Deadlines screen — this app has no per-court numbered form
 * to fill for this, so what it generates is a plain, jurisdiction-neutral
 * Certificate of Service (see certificateOfService.ts), not something dressed up as
 * an official state form this app doesn't actually have on file.
 */
export function LogProofOfServiceCard({ caseId, caseLabel, onLogged }: LogProofOfServiceCardProps) {
  const [state, setState] = useState<Step>({ step: 'closed' })
  const [parties, setParties] = useState<Party[]>([])
  const [pendingDeadlines, setPendingDeadlines] = useState<Deadline[]>([])

  useEffect(() => {
    if (state.step !== 'open') return
    let cancelled = false
    Promise.all([partyRepository.listForCase(caseId), deadlineRepository.listForCase(caseId)]).then(
      ([foundParties, foundDeadlines]) => {
        if (cancelled) return
        setParties(foundParties)
        setPendingDeadlines(foundDeadlines.filter((d) => d.status === 'pending'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [state.step, caseId])

  if (state.step === 'closed') {
    return (
      <button
        type="button"
        className={styles.prompt}
        onClick={() => setState({ step: 'open', form: EMPTY_FORM })}
        data-testid="log-proof-of-service-prompt"
      >
        <div className={styles.promptTitle}>Add proof of service</div>
        <div className={styles.promptNote}>Record that you served a document, and generate a certificate</div>
      </button>
    )
  }

  const form = state.step === 'error' ? EMPTY_FORM : state.form
  const patch = (partial: Partial<FormState>) => {
    if (state.step === 'open') setState({ step: 'open', form: { ...state.form, ...partial } })
  }

  const canSubmit = form.partyId !== '' && form.documentDescription.trim() !== '' && form.serviceDate !== ''

  const handleSubmit = async () => {
    if (state.step !== 'open' || !canSubmit) return
    setState({ step: 'submitting', form })
    try {
      const party = parties.find((p) => p.id === form.partyId)
      const result = await logProofOfService(
        caseId,
        {
          partyId: form.partyId,
          partyName: party?.name ?? 'Unknown party',
          documentDescription: form.documentDescription.trim(),
          serviceMethod: form.serviceMethod,
          serviceDate: new Date(form.serviceDate).getTime(),
          serviceAddress: form.serviceMethod === 'mail' ? form.serviceAddress.trim() || undefined : undefined,
          linkedDeadlineId: form.linkedDeadlineId || undefined,
        },
        proofOfServiceDeps,
      )
      setState({ step: 'result', result, form })
      onLogged(result)
    } catch {
      setState({ step: 'error' })
    }
  }

  const handleDownloadCertificate = async () => {
    if (state.step !== 'result') return
    const fontBytes = await loadFillFont()
    const bytes = await generateCertificateOfService(
      {
        caseLabel,
        documentDescription: state.result.proofOfService.documentDescription,
        partyName: state.result.proofOfService.partyName,
        serviceMethod: state.result.proofOfService.serviceMethod,
        serviceDate: state.result.proofOfService.serviceDate,
        serviceAddress: state.result.proofOfService.serviceAddress,
      },
      fontBytes,
    )
    triggerPdfDownload(pdfFilename('Certificate of Service'), bytes)
  }

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="log-proof-of-service-card">
      <SectionLabel>Add proof of service</SectionLabel>

      {(state.step === 'open' || state.step === 'submitting') && (
        <>
          {parties.length === 0 ? (
            <p className={styles.note} data-testid="log-proof-of-service-no-parties">
              Add a party to this case first — a proof of service needs someone to name as served.
            </p>
          ) : (
            <ChipGroup
              groupLabel="pos-party"
              options={parties.map((p) => ({ value: p.id, label: p.name }))}
              value={form.partyId || null}
              onChange={(value) => patch({ partyId: value })}
            />
          )}

          <TextInput
            value={form.documentDescription}
            onChange={(e) => patch({ documentDescription: e.target.value })}
            placeholder="Document served, e.g. Motion to Compel Discovery"
            disabled={state.step === 'submitting'}
            data-testid="log-proof-of-service-document"
          />

          <ChipGroup
            groupLabel="pos-method"
            options={SERVICE_METHOD_OPTIONS}
            value={form.serviceMethod}
            onChange={(value) => patch({ serviceMethod: value as ServiceMethod })}
          />

          {form.serviceMethod === 'mail' && (
            <TextInput
              value={form.serviceAddress}
              onChange={(e) => patch({ serviceAddress: e.target.value })}
              placeholder="Mailing address"
              disabled={state.step === 'submitting'}
              data-testid="log-proof-of-service-address"
            />
          )}

          <TextInput
            type="date"
            value={form.serviceDate}
            onChange={(e) => patch({ serviceDate: e.target.value })}
            disabled={state.step === 'submitting'}
            data-testid="log-proof-of-service-date"
          />

          {pendingDeadlines.length > 0 && (
            <>
              <SectionLabel>Link to a deadline (optional)</SectionLabel>
              <ChipGroup
                groupLabel="pos-deadline"
                options={[
                  { value: '', label: 'None' },
                  ...pendingDeadlines.map((d) => ({ value: d.id, label: d.title })),
                ]}
                value={form.linkedDeadlineId}
                onChange={(value) => patch({ linkedDeadlineId: value })}
              />
            </>
          )}

          <div className={styles.actions}>
            <PrimaryButton
              variant="secondary"
              onClick={() => setState({ step: 'closed' })}
              disabled={state.step === 'submitting'}
              data-testid="log-proof-of-service-cancel"
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton
              onClick={() => void handleSubmit()}
              disabled={state.step === 'submitting' || !canSubmit}
              data-testid="log-proof-of-service-submit"
            >
              {state.step === 'submitting' ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </div>
        </>
      )}

      {state.step === 'result' && (
        <>
          <p className={styles.resultText} data-testid="log-proof-of-service-success">
            Proof of service logged.
          </p>
          {state.result.extendedDeadline ? (
            <p className={styles.resultText} data-testid="log-proof-of-service-extension">
              Added a linked deadline: {state.result.extendedDeadline.title}, due{' '}
              {new Date(state.result.extendedDeadline.dueDate).toLocaleDateString()} ({state.result.extendedDeadline.ruleCitation}).
            </p>
          ) : form.linkedDeadlineId ? (
            <p className={styles.resultTextWarn} data-testid="log-proof-of-service-no-extension">
              No mail-service extension rule applies here — nothing was added beyond the original deadline.
            </p>
          ) : null}
          <PrimaryButton
            variant="secondary"
            onClick={() => void handleDownloadCertificate()}
            data-testid="log-proof-of-service-download"
          >
            Download certificate of service
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })} data-testid="log-proof-of-service-done">
            Done
          </PrimaryButton>
        </>
      )}

      {state.step === 'error' && (
        <>
          <p className={styles.resultTextWarn} role="alert" data-testid="log-proof-of-service-error">
            Could not save this proof of service. Please try again.
          </p>
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })}>
            Close
          </PrimaryButton>
        </>
      )}
    </GlassSurface>
  )
}
