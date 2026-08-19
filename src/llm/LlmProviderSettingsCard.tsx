import { useEffect, useState } from 'react'
import { GlassSurface } from '../components/GlassSurface'
import { ChipGroup } from '../wizard/ChipGroup'
import { SectionLabel, TextInput } from '../wizard/Field'
import { PrimaryButton } from '../wizard/PrimaryButton'
import { llmSettingsRepository } from './index'
import { getProviderDef, LLM_PROVIDERS } from './providers'
import { testConnection, type TestConnectionResult } from './testConnection'
import styles from './LlmProviderSettingsCard.module.css'

const PROVIDER_OPTIONS = LLM_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))

interface FieldState {
  apiKey: string
  model: string
  baseUrl: string
}

const EMPTY_FIELDS: FieldState = { apiKey: '', model: '', baseUrl: '' }

/**
 * BYOK settings — the blueprint's "LlmProvider layer": pick a provider, supply a
 * key (unless it's local/free like Ollama), pick a model, and test the connection
 * for real. `testConnection` is where the CORS question this app's own
 * architecture notes flagged as an open risk actually gets answered — empirically,
 * against the user's real account from their real browser — not assumed from any
 * provider's published docs.
 */
export function LlmProviderSettingsCard() {
  const [loaded, setLoaded] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('groq')
  const [fields, setFields] = useState<FieldState>(EMPTY_FIELDS)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  useEffect(() => {
    llmSettingsRepository.get().then((settings) => {
      const providerId = settings.activeProviderId ?? 'groq'
      const config = settings.providerConfigs[providerId]
      setSelectedProviderId(providerId)
      setFields({
        apiKey: config?.apiKey ?? '',
        model: config?.selectedModel ?? getProviderDef(providerId)?.defaultModel ?? '',
        baseUrl: config?.baseUrl ?? getProviderDef(providerId)?.defaultBaseUrl ?? '',
      })
      setLoaded(true)
    })
  }, [])

  const provider = getProviderDef(selectedProviderId)

  const handleSelectProvider = async (providerId: string) => {
    setSelectedProviderId(providerId)
    setSaved(false)
    setTestResult(null)
    const settings = await llmSettingsRepository.get()
    const config = settings.providerConfigs[providerId]
    const def = getProviderDef(providerId)
    setFields({
      apiKey: config?.apiKey ?? '',
      model: config?.selectedModel ?? def?.defaultModel ?? '',
      baseUrl: config?.baseUrl ?? def?.defaultBaseUrl ?? '',
    })
  }

  const handleSave = async () => {
    await llmSettingsRepository.updateProviderConfig(selectedProviderId, {
      apiKey: fields.apiKey || undefined,
      selectedModel: fields.model || undefined,
      baseUrl: provider?.editableBaseUrl ? fields.baseUrl || undefined : undefined,
    })
    await llmSettingsRepository.setActiveProvider(selectedProviderId)
    setSaved(true)
  }

  const handleTestConnection = async () => {
    if (!provider) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection(provider, fields.apiKey, fields.model || provider.defaultModel)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  if (!loaded || !provider) return null

  const canTest = !provider.requiresApiKey || fields.apiKey.trim() !== ''

  return (
    <GlassSurface style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="llm-provider-settings">
      <SectionLabel>AI provider</SectionLabel>
      <ChipGroup groupLabel="llm-provider" options={PROVIDER_OPTIONS} value={selectedProviderId} onChange={(v) => void handleSelectProvider(v)} />

      <div className={styles.disclosure} data-testid="llm-provider-disclosure">
        {provider.trainingDisclosure}
      </div>
      {provider.freeNoCard && <span className={styles.freeBadge}>FREE, NO CARD REQUIRED</span>}

      {provider.requiresApiKey && (
        <>
          <SectionLabel>API key</SectionLabel>
          <TextInput
            type="password"
            value={fields.apiKey}
            onChange={(e) => setFields((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="Paste your API key"
            data-testid="llm-provider-api-key"
          />
        </>
      )}

      <SectionLabel>Model</SectionLabel>
      <TextInput
        value={fields.model}
        onChange={(e) => setFields((f) => ({ ...f, model: e.target.value }))}
        placeholder={provider.defaultModel}
        data-testid="llm-provider-model"
      />

      {provider.editableBaseUrl && (
        <>
          <SectionLabel>Server address</SectionLabel>
          <TextInput
            value={fields.baseUrl}
            onChange={(e) => setFields((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder={provider.defaultBaseUrl}
            data-testid="llm-provider-base-url"
          />
        </>
      )}

      {testResult && (
        <div
          className={testResult.outcome === 'ok' ? styles.resultOk : styles.resultError}
          data-testid="llm-provider-test-result"
          data-outcome={testResult.outcome}
        >
          {testResult.detail}
        </div>
      )}

      {saved && !testResult && (
        <p className={styles.note} data-testid="llm-provider-saved-note">
          Saved.
        </p>
      )}

      <div className={styles.actions}>
        <PrimaryButton variant="secondary" onClick={() => void handleSave()} data-testid="llm-provider-save">
          Save
        </PrimaryButton>
        <PrimaryButton disabled={!canTest || testing} onClick={() => void handleTestConnection()} data-testid="llm-provider-test">
          {testing ? 'Testing…' : 'Test connection'}
        </PrimaryButton>
      </div>
    </GlassSurface>
  )
}
