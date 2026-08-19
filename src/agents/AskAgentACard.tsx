import { useState } from 'react'
import { getProviderDef, llmSettingsRepository } from '../llm'
import { DisclaimerBanner } from '../uplFirewall'
import { GlassSurface } from '../components/GlassSurface'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { askAgentA, type AgentAResult } from './agentA'
import styles from './AskAgentACard.module.css'

interface AskAgentACardProps {
  jurisdiction: string
  caseType: string
}

type Step =
  | { step: 'closed' }
  | { step: 'open'; query: string }
  | { step: 'asking'; query: string }
  | { step: 'result'; query: string; result: AgentAResult }
  | { step: 'no-provider' }
  | { step: 'error' }

const STATUS_NOTE: Record<Exclude<AgentAResult['status'], 'answered'>, string> = {
  'no-sources': "We don't have legal sources for this jurisdiction yet — this feature currently only covers CA and federal.",
  'retrieval-failed': "Couldn't retrieve any of the relevant source pages right now. Check your connection and try again.",
  'llm-error': 'Could not get a response from your configured AI provider. Check your Vault settings and try again.',
  'out-of-bounds': "The available sources don't contain enough information to answer this — see the explanation below rather than a guess.",
}

/**
 * The blueprint's Agent A, wired to a real case: scopes to this case's own
 * jurisdiction and case type (Chunk 30), retrieves live (Chunk 31), asks whichever
 * provider the user configured (Chunk 38), and shows citation verification
 * results plainly — a citation that didn't match a real source is flagged, not
 * silently trusted. The disclaimer banner (Chunk 25) is permanent on this card,
 * not just shown once, matching the blueprint's "permanent disclaimer banner on
 * AI screens."
 */
export function AskAgentACard({ jurisdiction, caseType }: AskAgentACardProps) {
  const [state, setState] = useState<Step>({ step: 'closed' })

  const handleOpen = async () => {
    const settings = await llmSettingsRepository.get()
    const providerId = settings.activeProviderId
    const provider = providerId ? getProviderDef(providerId) : undefined
    const config = providerId ? settings.providerConfigs[providerId] : undefined
    if (!provider || (provider.requiresApiKey && !config?.apiKey)) {
      setState({ step: 'no-provider' })
      return
    }
    setState({ step: 'open', query: '' })
  }

  const handleAsk = async () => {
    if (state.step !== 'open' || !state.query.trim()) return
    const query = state.query.trim()
    setState({ step: 'asking', query })
    try {
      const settings = await llmSettingsRepository.get()
      const providerId = settings.activeProviderId!
      const provider = getProviderDef(providerId)!
      const config = settings.providerConfigs[providerId]
      const result = await askAgentA({
        query,
        jurisdiction,
        caseType,
        provider,
        apiKey: config?.apiKey ?? '',
        model: config?.selectedModel ?? provider.defaultModel,
      })
      setState({ step: 'result', query, result })
    } catch {
      setState({ step: 'error' })
    }
  }

  if (state.step === 'closed') {
    return (
      <button type="button" className={styles.prompt} onClick={() => void handleOpen()} data-testid="ask-agent-a-prompt">
        <div className={styles.promptTitle}>Ask a legal question about this case</div>
        <div className={styles.promptNote}>Answered only from real, cited sources — never a guess</div>
      </button>
    )
  }

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="ask-agent-a-card">
      <SectionLabel>Ask a legal question</SectionLabel>
      <DisclaimerBanner />

      {state.step === 'no-provider' && (
        <>
          <p className={styles.infoNote} data-testid="ask-agent-a-no-provider">
            Set up an AI provider in Vault settings first — this feature needs one to work.
          </p>
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })} data-testid="ask-agent-a-close">
            Close
          </PrimaryButton>
        </>
      )}

      {(state.step === 'open' || state.step === 'asking') && (
        <>
          <TextInput
            value={state.query}
            onChange={(e) => setState({ step: 'open', query: e.target.value })}
            placeholder="e.g. How long do I have to respond to a summons?"
            disabled={state.step === 'asking'}
            data-testid="ask-agent-a-input"
          />
          <div className={styles.actions}>
            <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })} disabled={state.step === 'asking'} data-testid="ask-agent-a-cancel">
              Cancel
            </PrimaryButton>
            <PrimaryButton onClick={() => void handleAsk()} disabled={state.step === 'asking' || !state.query.trim()} data-testid="ask-agent-a-submit">
              {state.step === 'asking' ? 'Asking…' : 'Ask'}
            </PrimaryButton>
          </div>
        </>
      )}

      {state.step === 'result' && (
        <>
          {state.result.status !== 'answered' && state.result.status !== 'out-of-bounds' && (
            <p className={styles.infoNote} data-testid="ask-agent-a-status-note">
              {STATUS_NOTE[state.result.status]}
            </p>
          )}

          {(state.result.status === 'answered' || state.result.status === 'out-of-bounds') && (
            <>
              {state.result.status === 'out-of-bounds' && (
                <p className={styles.infoNote} data-testid="ask-agent-a-status-note">
                  {STATUS_NOTE['out-of-bounds']}
                </p>
              )}
              <p className={styles.answer} data-testid="ask-agent-a-answer">
                {state.result.answerText}
              </p>
              {state.result.verifiedCitations.length > 0 && (
                <>
                  <div className={styles.citationsLabel}>SOURCES CITED</div>
                  {state.result.verifiedCitations.map((c) => (
                    <a key={c.sourceRef} href={c.sourceUrl} target="_blank" rel="noreferrer" className={styles.citationLink} data-testid="ask-agent-a-citation">
                      {c.sourceRef}
                    </a>
                  ))}
                </>
              )}
              {state.result.unverifiedCitations.length > 0 && (
                <p className={styles.warnNote} data-testid="ask-agent-a-unverified">
                  The answer referenced {state.result.unverifiedCitations.join(', ')}, which doesn't match any source
                  actually provided — treat that part with real caution.
                </p>
              )}
            </>
          )}

          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })} data-testid="ask-agent-a-done">
            Done
          </PrimaryButton>
        </>
      )}

      {state.step === 'error' && (
        <>
          <p className={styles.warnNote} role="alert" data-testid="ask-agent-a-error">
            Something went wrong asking that question. Please try again.
          </p>
          <PrimaryButton variant="secondary" onClick={() => setState({ step: 'closed' })}>
            Close
          </PrimaryButton>
        </>
      )}
    </GlassSurface>
  )
}
