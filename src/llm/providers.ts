export interface LlmProviderDef {
  id: string
  label: string
  /** A sensible starting point, not an exhaustive or guaranteed-current catalog — model names and lineups change too often across every one of these providers to hardcode reliably. The model field in settings is free text, pre-filled with this. */
  defaultModel: string
  requiresApiKey: boolean
  /** True only where this app can name a genuinely free, no-card tier — Groq is the app's default specifically because of this. */
  freeNoCard: boolean
  trainingDisclosure: string
  /**
   * Whether this provider's API is documented to allow direct browser calls
   * (permissive CORS). This is a *starting expectation* from public documentation,
   * not an empirical guarantee for any given account/region/API version — the
   * `testConnection` button in settings is the actual, authoritative check, run
   * for real from the user's own browser. Treat this field as "worth trying
   * directly first," never as certainty either way.
   */
  expectedDirectBrowserSupport: boolean
  /** Only Ollama's base URL is meant to be edited — it's a local/self-hosted address, not a fixed public API. */
  editableBaseUrl: boolean
  defaultBaseUrl: string
}

/**
 * Providers this app is designed to work with, per the architecture decisions:
 * Groq as the free, no-card default; Anthropic, OpenAI, Gemini, OpenRouter, and
 * Ollama (local/custom) as BYOK options. Gemini's free tier is flagged here
 * because its own terms permit human review and training on submitted content —
 * a real cost this app holds SSNs and case filings against, disclosed at the
 * point of selection rather than buried in a privacy policy nobody reads.
 */
export const LLM_PROVIDERS: readonly LlmProviderDef[] = [
  {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    freeNoCard: true,
    trainingDisclosure: "Groq's terms state they do not train on API inputs or outputs.",
    expectedDirectBrowserSupport: false,
    editableBaseUrl: false,
    defaultBaseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    requiresApiKey: true,
    freeNoCard: false,
    trainingDisclosure: 'Anthropic does not train on API inputs or outputs by default.',
    expectedDirectBrowserSupport: true,
    editableBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
    freeNoCard: false,
    trainingDisclosure: "OpenAI's API terms state API inputs/outputs are not used for training by default (unlike the consumer ChatGPT product's default).",
    expectedDirectBrowserSupport: false,
    editableBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    requiresApiKey: true,
    freeNoCard: false,
    trainingDisclosure: "Google's free tier permits human review and training on submitted content — a real privacy cost for an app holding sensitive case data. A paid tier avoids this; the free tier does not.",
    expectedDirectBrowserSupport: false,
    editableBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    requiresApiKey: true,
    freeNoCard: false,
    trainingDisclosure: 'OpenRouter routes to many underlying providers, each with its own training policy — check the specific model you select.',
    expectedDirectBrowserSupport: false,
    editableBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  },
  {
    id: 'ollama',
    label: 'Ollama (local/custom)',
    defaultModel: 'llama3.3',
    requiresApiKey: false,
    freeNoCard: true,
    trainingDisclosure: 'Runs entirely on your own machine — nothing leaves your device.',
    expectedDirectBrowserSupport: true,
    editableBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/api/chat',
  },
] as const

export function getProviderDef(id: string): LlmProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id)
}
