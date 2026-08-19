import { useState } from 'react'
import { getProviderDef, llmSettingsRepository } from '../llm'
import { AdoptionGate, DEFAULT_DRAFT_WATERMARK_TEXT, DisclaimerBanner } from '../uplFirewall'
import { GlassSurface } from '../components/GlassSurface'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { askAgentD, type AgentDResult } from './agentD'
import styles from './DraftingPanel.module.css'

interface DraftingPanelProps {
  jurisdiction: string
  caseType: string
  caseLabel: string
}

type Step =
  | { step: 'form'; motionTitle: string; factsSummary: string }
  | { step: 'drafting'; motionTitle: string }
  | { step: 'result'; motionTitle: string; result: AgentDResult }
  | { step: 'adopted'; motionTitle: string; result: AgentDResult }
  | { step: 'no-provider' }
  | { step: 'error' }

const STATUS_NOTE: Record<Exclude<AgentDResult['status'], 'drafted'>, string> = {
  'no-sources': "We don't have legal sources for this jurisdiction yet — this feature currently only covers CA and federal.",
  'retrieval-failed': "Couldn't retrieve any of the relevant source pages right now. Check your connection and try again.",
  'outline-error': 'Could not get a response from your configured AI provider while outlining. Check your Vault settings and try again.',
  'outline-uncited':
    "The outline kept citing authorities that don't appear in the retrieved sources, even after one retry — stopped before drafting rather than build on an uncited outline.",
  'draft-error': 'The outline was generated, but the full-draft stage failed. Check your Vault settings and try again.',
  'critique-error': 'The draft was generated, but the review stage failed. Check your Vault settings and try again.',
}

function triggerTextDownload(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const INITIAL_FORM: Step = { step: 'form', motionTitle: '', factsSummary: '' }

/**
 * Agent D's three-stage drafting pipeline (Chunk 43), wired to a real case: the
 * user supplies the facts directly (this app has no rich case-narrative field to
 * draw one from automatically), the pipeline outlines → drafts → critiques using
 * only the jurisdiction's own retrieved sources, and the final draft can only be
 * used after passing through the existing UPL AdoptionGate (Chunk 25) — never
 * auto-adopted. There's no polished court-formatted PDF output yet (that's the
 * ruled-line paragraph engine, Chunk 45); adopting here offers a plain-text
 * download, clearly marked as a working draft, not a filing-ready document.
 */
export function DraftingPanel({ jurisdiction, caseType, caseLabel }: DraftingPanelProps) {
  const [state, setState] = useState<Step>(INITIAL_FORM)
  const [gateOpen, setGateOpen] = useState(false)

  const handleGenerate = async () => {
    if (state.step !== 'form' || !state.motionTitle.trim() || !state.factsSummary.trim()) return
    const { motionTitle, factsSummary } = state

    const settings = await llmSettingsRepository.get()
    const providerId = settings.activeProviderId
    const provider = providerId ? getProviderDef(providerId) : undefined
    const config = providerId ? settings.providerConfigs[providerId] : undefined
    if (!provider || (provider.requiresApiKey && !config?.apiKey)) {
      setState({ step: 'no-provider' })
      return
    }

    setState({ step: 'drafting', motionTitle })
    try {
      const result = await askAgentD({
        motionTitle,
        factsSummary,
        jurisdiction,
        caseType,
        provider,
        apiKey: config?.apiKey ?? '',
        model: config?.selectedModel ?? provider.defaultModel,
      })
      setState({ step: 'result', motionTitle, result })
    } catch {
      setState({ step: 'error' })
    }
  }

  const handleDownload = (motionTitle: string, result: AgentDResult) => {
    const text = `${DEFAULT_DRAFT_WATERMARK_TEXT}\n\n${motionTitle}\n\n${result.finalText}`
    const safeName = `${caseLabel}-${motionTitle}`.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft'
    triggerTextDownload(`${safeName}.txt`, text)
  }

  if (state.step === 'form' || state.step === 'drafting') {
    return (
      <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="drafting-form">
        <p className={styles.note} data-testid="drafting-case-label">
          Drafting for {caseLabel}
        </p>
        <SectionLabel>Motion title</SectionLabel>
        <TextInput
          value={state.motionTitle}
          onChange={(e) => state.step === 'form' && setState({ ...state, motionTitle: e.target.value })}
          placeholder="e.g. Motion to Dismiss"
          disabled={state.step === 'drafting'}
          data-testid="drafting-motion-title"
        />
        <SectionLabel>Facts of your case</SectionLabel>
        <textarea
          className={styles.factsTextarea}
          value={state.step === 'form' ? state.factsSummary : ''}
          onChange={(e) => state.step === 'form' && setState({ ...state, factsSummary: e.target.value })}
          placeholder="Describe what happened, in your own words — this is the only source of facts the draft will use."
          rows={5}
          disabled={state.step === 'drafting'}
          data-testid="drafting-facts-input"
        />
        <PrimaryButton
          onClick={() => void handleGenerate()}
          disabled={state.step === 'drafting' || !(state.step === 'form' && state.motionTitle.trim() && state.factsSummary.trim())}
          data-testid="drafting-generate"
        >
          {state.step === 'drafting' ? 'Drafting… (outline → draft → review)' : 'Generate draft'}
        </PrimaryButton>
      </GlassSurface>
    )
  }

  if (state.step === 'no-provider') {
    return (
      <GlassSurface style={{ padding: 16 }} data-testid="drafting-no-provider">
        <p className={styles.note}>Set up an AI provider in Vault settings first — drafting needs one to work.</p>
      </GlassSurface>
    )
  }

  if (state.step === 'error') {
    return (
      <GlassSurface style={{ padding: 16 }} data-testid="drafting-error">
        <p className={styles.warnNote} role="alert">
          Something went wrong generating this draft. Please try again.
        </p>
      </GlassSurface>
    )
  }

  const { motionTitle, result } = state

  return (
    <div className={styles.resultStack}>
      <DisclaimerBanner />

      {result.status !== 'drafted' && (
        <GlassSurface style={{ padding: 16 }} data-testid="drafting-status-note">
          <p className={styles.note}>{STATUS_NOTE[result.status]}</p>
          {result.status === 'outline-uncited' && result.uncitedOutlineCitations.length > 0 && (
            <p className={styles.warnNote}>Uncited: {result.uncitedOutlineCitations.join(', ')}</p>
          )}
        </GlassSurface>
      )}

      {result.status === 'drafted' && (
        <>
          {result.unreachableSources.length > 0 && (
            <GlassSurface style={{ padding: 12 }} data-testid="drafting-unreachable-note">
              <p className={styles.note}>Could not reach: {result.unreachableSources.join(', ')} — the draft proceeded without them.</p>
            </GlassSurface>
          )}
          <GlassSurface style={{ padding: 16 }} data-testid="drafting-final-text">
            <div className={styles.panelKicker}>{motionTitle.toUpperCase()} — DRAFT</div>
            <p className={styles.draftBody}>{result.finalText}</p>
          </GlassSurface>

          {state.step === 'result' && (
            <PrimaryButton onClick={() => setGateOpen(true)} data-testid="drafting-adopt-open">
              Review & adopt
            </PrimaryButton>
          )}
        </>
      )}

      {state.step === 'adopted' && (
        <>
          <div className={styles.adoptedNote} data-testid="drafting-adopted-note">
            Adopted — this is now treated as your own working draft, not AI output.
          </div>
          <PrimaryButton variant="secondary" onClick={() => handleDownload(motionTitle, result)} data-testid="drafting-download">
            Download draft (.txt)
          </PrimaryButton>
        </>
      )}

      <PrimaryButton variant="secondary" onClick={() => setState(INITIAL_FORM)} data-testid="drafting-start-over">
        Start a new draft
      </PrimaryButton>

      {gateOpen && state.step === 'result' && result.status === 'drafted' && (
        <AdoptionGate
          title={motionTitle}
          description={`This draft for "${caseLabel}" was written by an AI, grounded only in the sources it was given — it is not legal advice and no attorney has reviewed it. Adopting it means you have read it in full and are taking responsibility for its content as your own.`}
          onAdopt={() => {
            setGateOpen(false)
            setState({ step: 'adopted', motionTitle, result })
          }}
          onCancel={() => setGateOpen(false)}
        />
      )}
    </div>
  )
}
