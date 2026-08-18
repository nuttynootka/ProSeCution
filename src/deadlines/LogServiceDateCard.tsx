import { useState } from 'react'
import { GlassSurface } from '../components/GlassSurface'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { deadlineRepository } from './index'
import type { Deadline } from './types'
import styles from './LogServiceDateCard.module.css'

type Step =
  | { step: 'closed' }
  | { step: 'open'; date: string }
  | { step: 'submitting' }
  | { step: 'result'; created: Deadline[] }
  | { step: 'error' }

interface LogServiceDateCardProps {
  caseId: string
  onCreated: (created: Deadline[]) => void
}

/**
 * The only entry point anywhere in the app for actually creating a deadline. Scoped
 * to a single trigger — "I was served with the summons and complaint" — because
 * that's the only one with a real seeded rule in either jurisdiction (Chunk 12);
 * offering the calculation engine's other trigger types here would mean most choices
 * silently producing nothing, which is exactly the fake-functional pattern this
 * project avoids elsewhere.
 */
export function LogServiceDateCard({ caseId, onCreated }: LogServiceDateCardProps) {
  const [state, setState] = useState<Step>({ step: 'closed' })

  if (state.step === 'closed') {
    return (
      <button
        type="button"
        className={styles.prompt}
        onClick={() => setState({ step: 'open', date: '' })}
        data-testid="log-service-date-prompt"
      >
        <div className={styles.promptTitle}>Log the date you were served</div>
        <div className={styles.promptNote}>Calculates your response deadline automatically</div>
      </button>
    )
  }

  const handleSubmit = async () => {
    if (state.step !== 'open' || !state.date) return
    setState({ step: 'submitting' })
    try {
      const triggerDate = new Date(state.date).getTime()
      const created = await deadlineRepository.createFromTrigger(caseId, 'service_of_summons', triggerDate)
      setState({ step: 'result', created })
      onCreated(created)
    } catch {
      setState({ step: 'error' })
    }
  }

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="log-service-date-card">
      <SectionLabel>Date served</SectionLabel>

      {(state.step === 'open' || state.step === 'submitting') && (
        <>
          <TextInput
            type="date"
            value={state.step === 'open' ? state.date : ''}
            onChange={(e) => setState({ step: 'open', date: e.target.value })}
            disabled={state.step === 'submitting'}
            data-testid="log-service-date-input"
          />
          <div className={styles.actions}>
            <PrimaryButton
              variant="secondary"
              onClick={() => setState({ step: 'closed' })}
              disabled={state.step === 'submitting'}
              data-testid="log-service-date-cancel"
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton
              onClick={() => void handleSubmit()}
              disabled={state.step === 'submitting' || (state.step === 'open' && !state.date)}
              data-testid="log-service-date-submit"
            >
              {state.step === 'submitting' ? 'Calculating…' : 'Calculate deadline'}
            </PrimaryButton>
          </div>
        </>
      )}

      {state.step === 'result' && (
        <>
          {state.created.length > 0 ? (
            <p className={styles.resultText} data-testid="log-service-date-success">
              Added {state.created.length} deadline{state.created.length === 1 ? '' : 's'} — see the Deadlines tab.
            </p>
          ) : (
            <p className={styles.resultTextWarn} data-testid="log-service-date-unsupported">
              We don't have deadline rules for this jurisdiction yet. Consult a local rule or attorney for your
              actual response deadline.
            </p>
          )}
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })} data-testid="log-service-date-done">
            Done
          </PrimaryButton>
        </>
      )}

      {state.step === 'error' && (
        <>
          <p className={styles.resultTextWarn} role="alert" data-testid="log-service-date-error">
            Could not calculate a deadline. Please try again.
          </p>
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })}>
            Close
          </PrimaryButton>
        </>
      )}
    </GlassSurface>
  )
}
