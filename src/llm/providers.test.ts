import { describe, expect, it } from 'vitest'
import { getProviderDef, LLM_PROVIDERS } from './providers'

describe('LLM_PROVIDERS', () => {
  it('includes exactly the six providers this app is designed for', () => {
    expect(LLM_PROVIDERS.map((p) => p.id).sort()).toEqual(['anthropic', 'gemini', 'groq', 'ollama', 'openai', 'openrouter'])
  })

  it('Groq is the free, no-card default the architecture decisions specify', () => {
    const groq = getProviderDef('groq')!
    expect(groq.freeNoCard).toBe(true)
    expect(groq.requiresApiKey).toBe(true)
  })

  it("flags Gemini's free-tier training policy explicitly, not silently", () => {
    const gemini = getProviderDef('gemini')!
    expect(gemini.trainingDisclosure.toLowerCase()).toContain('train')
  })

  it('only Ollama has an editable base URL', () => {
    for (const p of LLM_PROVIDERS) {
      expect(p.editableBaseUrl).toBe(p.id === 'ollama')
    }
  })

  it('returns undefined for an unknown provider id', () => {
    expect(getProviderDef('does-not-exist')).toBeUndefined()
  })
})
