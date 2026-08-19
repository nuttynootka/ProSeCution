import type { LlmProviderDef } from './providers'

export interface LlmRequestSpec {
  url: string
  headers: Record<string, string>
  body: unknown
}

/**
 * Builds the real, provider-specific request shape for a single-turn prompt.
 * Three distinct API shapes, not one generic one: Groq/OpenAI/OpenRouter/Ollama
 * all speak the OpenAI-compatible chat-completions format; Anthropic's Messages
 * API is its own shape (and needs the `anthropic-dangerous-direct-browser-access`
 * opt-in header to be callable from a browser at all — without it, Anthropic
 * rejects the request even though the endpoint otherwise supports CORS); Gemini's
 * generateContent API is a third shape, with the API key as a query parameter
 * rather than a header.
 */
export function buildLlmRequest(provider: LlmProviderDef, apiKey: string, model: string, prompt: string): LlmRequestSpec {
  const baseUrl = provider.defaultBaseUrl

  if (provider.id === 'anthropic') {
    return {
      url: baseUrl,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: { model, max_tokens: 256, messages: [{ role: 'user', content: prompt }] },
    }
  }

  if (provider.id === 'gemini') {
    return {
      url: `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'content-type': 'application/json' },
      body: { contents: [{ parts: [{ text: prompt }] }] },
    }
  }

  // OpenAI-compatible: Groq, OpenAI, OpenRouter, Ollama.
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (provider.requiresApiKey) headers.authorization = `Bearer ${apiKey}`
  return {
    url: baseUrl,
    headers,
    body: { model, messages: [{ role: 'user', content: prompt }] },
  }
}

/** Pulls the model's reply text out of a provider's real response shape — the counterpart to buildLlmRequest's three shapes. Returns null rather than throwing on an unrecognized/error response, so the caller can report "no reply" cleanly. */
export function extractLlmReplyText(provider: LlmProviderDef, responseJson: unknown): string | null {
  if (typeof responseJson !== 'object' || responseJson === null) return null
  const json = responseJson as Record<string, unknown>

  if (provider.id === 'anthropic') {
    const content = json.content
    if (!Array.isArray(content) || content.length === 0) return null
    const first = content[0] as Record<string, unknown>
    return typeof first.text === 'string' ? first.text : null
  }

  if (provider.id === 'gemini') {
    const candidates = json.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) return null
    const parts = (candidates[0] as Record<string, unknown>)?.content as Record<string, unknown> | undefined
    const partsArr = parts?.parts
    if (!Array.isArray(partsArr) || partsArr.length === 0) return null
    const text = (partsArr[0] as Record<string, unknown>).text
    return typeof text === 'string' ? text : null
  }

  // OpenAI-compatible.
  const choices = json.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined
  return typeof message?.content === 'string' ? message.content : null
}
