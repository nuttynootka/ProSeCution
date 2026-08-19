import { describe, expect, it } from 'vitest'
import { getProviderDef } from './providers'
import { buildLlmRequest, extractLlmReplyText } from './requestAdapter'

const groq = getProviderDef('groq')!
const anthropic = getProviderDef('anthropic')!
const gemini = getProviderDef('gemini')!
const ollama = getProviderDef('ollama')!

describe('buildLlmRequest', () => {
  it('builds an OpenAI-compatible request for Groq, with a bearer token', () => {
    const req = buildLlmRequest(groq, 'gsk_test', 'llama-3.3-70b-versatile', 'hello')
    expect(req.url).toBe(groq.defaultBaseUrl)
    expect(req.headers.authorization).toBe('Bearer gsk_test')
    expect(req.body).toEqual({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hello' }] })
  })

  it("builds Anthropic's own request shape, with the browser opt-in header", () => {
    const req = buildLlmRequest(anthropic, 'sk-ant-test', 'claude-sonnet-5', 'hello')
    expect(req.headers['x-api-key']).toBe('sk-ant-test')
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(req.body).toMatchObject({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hello' }] })
  })

  it("builds Gemini's own request shape, with the key as a query parameter, not a header", () => {
    const req = buildLlmRequest(gemini, 'AIza-test', 'gemini-2.0-flash', 'hello')
    expect(req.url).toContain('gemini-2.0-flash:generateContent?key=AIza-test')
    expect(req.body).toEqual({ contents: [{ parts: [{ text: 'hello' }] }] })
  })

  it('omits the authorization header for a provider that does not require an API key', () => {
    const req = buildLlmRequest(ollama, '', 'llama3.3', 'hello')
    expect(req.headers.authorization).toBeUndefined()
  })
})

describe('extractLlmReplyText', () => {
  it('extracts from an OpenAI-compatible response', () => {
    expect(extractLlmReplyText(groq, { choices: [{ message: { content: 'OK' } }] })).toBe('OK')
  })

  it("extracts from Anthropic's response shape", () => {
    expect(extractLlmReplyText(anthropic, { content: [{ text: 'OK' }] })).toBe('OK')
  })

  it("extracts from Gemini's response shape", () => {
    expect(extractLlmReplyText(gemini, { candidates: [{ content: { parts: [{ text: 'OK' }] } }] })).toBe('OK')
  })

  it('returns null for a malformed or error response, rather than throwing', () => {
    expect(extractLlmReplyText(groq, { error: 'rate limited' })).toBeNull()
    expect(extractLlmReplyText(anthropic, {})).toBeNull()
    expect(extractLlmReplyText(gemini, { candidates: [] })).toBeNull()
    expect(extractLlmReplyText(groq, null)).toBeNull()
  })
})
