import { useState } from 'react'
import { getProviderDef, llmSettingsRepository } from '../llm'
import { DisclaimerBanner } from '../uplFirewall'
import { GlassSurface } from '../components/GlassSurface'
import { SectionLabel } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { auditOpposingFiling, type AgentBResult } from './agentB'
import styles from './AuditPanel.module.css'

interface AuditPanelProps {
  jurisdiction: string
  caseType: string
  caseLabel: string
}

type Step =
  | { step: 'form'; filingText: string }
  | { step: 'auditing' }
  | { step: 'result'; result: AgentBResult }
  | { step: 'no-provider' }
  | { step: 'error' }

const STRENGTH_LABEL = (score: number): string => {
  if (score <= 3) return 'weak'
  if (score <= 6) return 'moderate'
  return 'strong'
}

const INITIAL_FORM: Step = { step: 'form', filingText: '' }

/**
 * Agent B — the opposing filing auditor (Chunk 44). The user pastes the opposing
 * party's filing text directly, same "user supplies it, nothing fabricated" pattern
 * as the drafting panel's facts field — this app has no document-picker wired to
 * OCR text for this purpose yet. Unlike Agent A/D, a missing local corpus never
 * blocks the audit (see agentB.ts's doc comment) — the prompt itself says to
 * proceed and mark gaps "NOT PROVIDED".
 */
export function AuditPanel({ jurisdiction, caseType, caseLabel }: AuditPanelProps) {
  const [state, setState] = useState<Step>(INITIAL_FORM)

  const handleAudit = async () => {
    if (state.step !== 'form' || !state.filingText.trim()) return
    const filingText = state.filingText.trim()

    const settings = await llmSettingsRepository.get()
    const providerId = settings.activeProviderId
    const provider = providerId ? getProviderDef(providerId) : undefined
    const config = providerId ? settings.providerConfigs[providerId] : undefined
    if (!provider || (provider.requiresApiKey && !config?.apiKey)) {
      setState({ step: 'no-provider' })
      return
    }

    setState({ step: 'auditing' })
    try {
      const result = await auditOpposingFiling({
        filingText,
        jurisdiction,
        caseType,
        provider,
        apiKey: config?.apiKey ?? '',
        model: config?.selectedModel ?? provider.defaultModel,
      })
      setState({ step: 'result', result })
    } catch {
      setState({ step: 'error' })
    }
  }

  if (state.step === 'form' || state.step === 'auditing') {
    return (
      <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="audit-form">
        <p className={styles.note} data-testid="audit-case-label">
          Auditing for {caseLabel}
        </p>
        <SectionLabel>Opposing filing text</SectionLabel>
        <textarea
          className={styles.filingTextarea}
          value={state.step === 'form' ? state.filingText : ''}
          onChange={(e) => state.step === 'form' && setState({ step: 'form', filingText: e.target.value })}
          placeholder="Paste the full text of the opposing party's filing here."
          rows={6}
          disabled={state.step === 'auditing'}
          data-testid="audit-filing-input"
        />
        <PrimaryButton
          onClick={() => void handleAudit()}
          disabled={state.step === 'auditing' || !(state.step === 'form' && state.filingText.trim())}
          data-testid="audit-submit"
        >
          {state.step === 'auditing' ? 'Analyzing…' : 'Analyze filing'}
        </PrimaryButton>
      </GlassSurface>
    )
  }

  if (state.step === 'no-provider') {
    return (
      <GlassSurface style={{ padding: 16 }} data-testid="audit-no-provider">
        <p className={styles.note}>Set up an AI provider in Vault settings first — this feature needs one to work.</p>
      </GlassSurface>
    )
  }

  if (state.step === 'error') {
    return (
      <GlassSurface style={{ padding: 16 }} data-testid="audit-error">
        <p className={styles.warnNote} role="alert">
          Something went wrong analyzing that filing. Please try again.
        </p>
      </GlassSurface>
    )
  }

  const { result } = state

  return (
    <div className={styles.resultStack}>
      <DisclaimerBanner />

      {result.status === 'llm-error' && (
        <GlassSurface style={{ padding: 16 }} data-testid="audit-status-note">
          <p className={styles.note}>Could not get a response from your configured AI provider. Check your Vault settings and try again.</p>
        </GlassSurface>
      )}
      {result.status === 'parse-error' && (
        <GlassSurface style={{ padding: 16 }} data-testid="audit-status-note">
          <p className={styles.note}>The AI's response couldn't be read as a structured analysis. Please try again.</p>
        </GlassSurface>
      )}

      {result.status === 'audited' && (
        <>
          {result.unreachableSources.length > 0 && (
            <GlassSurface style={{ padding: 12 }} data-testid="audit-unreachable-note">
              <p className={styles.note}>Could not reach: {result.unreachableSources.join(', ')} — related gaps are marked "NOT PROVIDED".</p>
            </GlassSurface>
          )}

          <GlassSurface style={{ padding: 16 }} data-testid="audit-strength">
            <div className={styles.panelKicker}>OPPOSITION STRENGTH</div>
            {result.argumentStrengthScore === null ? (
              <p className={styles.note}>The AI didn't return a usable strength score for this filing.</p>
            ) : (
              <>
                <div className={styles.strengthRow}>
                  <div className={styles.strengthScore} data-testid="audit-strength-score">
                    {result.argumentStrengthScore}
                  </div>
                  <div className={styles.strengthSub}>
                    of 10 — {STRENGTH_LABEL(result.argumentStrengthScore)}.
                    {result.proceduralGaps.length > 0 && (
                      <>
                        <br />
                        {result.proceduralGaps.length} prerequisite{result.proceduralGaps.length === 1 ? '' : 's'} missing.
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.strengthBar}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className={i < result.argumentStrengthScore! ? `${styles.strengthSegment} ${styles.strengthSegmentFilled}` : styles.strengthSegment}
                    />
                  ))}
                </div>
              </>
            )}
          </GlassSurface>

          {result.proceduralGaps.map((gap, i) => (
            <GlassSurface key={i} style={{ padding: 14 }} data-testid="audit-gap-card">
              <div className={styles.gapTag}>PROCEDURAL GAP</div>
              <div className={styles.gapBody}>{gap.description}</div>
              <div className={styles.gapCite}>{gap.ruleCitation}</div>
            </GlassSurface>
          ))}

          {result.factualContradictions.length > 0 && (
            <GlassSurface style={{ padding: 14 }} data-testid="audit-contradictions">
              <div className={styles.panelKicker}>FACTUAL CONTRADICTIONS</div>
              {result.factualContradictions.map((c, i) => (
                <p key={i} className={styles.contradictionRow}>
                  {c}
                </p>
              ))}
            </GlassSurface>
          )}

          {result.responseOptions.length > 0 && (
            <GlassSurface style={{ padding: 14 }} data-testid="audit-response-options">
              <div className={styles.panelKicker}>RESPONSE OPTIONS</div>
              {result.responseOptions.map((option, i) => (
                <div key={i} className={styles.optionRow}>
                  <div className={styles.optionTitle}>{option.title}</div>
                  <div className={styles.optionCite}>{option.legalBasis}</div>
                </div>
              ))}
            </GlassSurface>
          )}
        </>
      )}

      <PrimaryButton variant="secondary" onClick={() => setState(INITIAL_FORM)} data-testid="audit-start-over">
        Analyze a different filing
      </PrimaryButton>
    </div>
  )
}
