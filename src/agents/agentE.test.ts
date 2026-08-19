import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from '../llm'
import type { PiiCandidate } from '../redaction'
import { reviewAmbiguousPii } from './agentE'

const groq = getProviderDef('groq')!
const GROQ_URL = groq.defaultBaseUrl

const CANDIDATES: PiiCandidate[] = [
  { id: 'candidate-0', type: 'ssn', text: '923-45-6789', start: 0, end: 11, context: 'Case ref 923-45-6789 on file.' },
  { id: 'candidate-1', type: 'financial-account', text: '123456789', start: 20, end: 29, context: 'Routing Number: 123456789.' },
]

function llmResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response
}

function mockFetch(handler: () => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(async () => handler()))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reviewAmbiguousPii', () => {
  it('reports no-candidates and never calls the LLM when there is nothing ambiguous', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await reviewAmbiguousPii({ text: 'no candidates here', candidates: [], provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('no-candidates')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps a real per-candidate JSON response back onto the right candidates', async () => {
    mockFetch(() =>
      llmResponse(
        JSON.stringify([
          { id: 'candidate-0', is_sensitive: true, reason: 'Looks like a real reference number tied to a person.' },
          { id: 'candidate-1', is_sensitive: false, reason: "This is a bank's published routing number, not personal." },
        ]),
      ),
    )

    const result = await reviewAmbiguousPii({ text: 'irrelevant', candidates: CANDIDATES, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('reviewed')
    expect(result.reviews).toEqual([
      { candidate: CANDIDATES[0], isSensitive: true, reason: 'Looks like a real reference number tied to a person.' },
      { candidate: CANDIDATES[1], isSensitive: false, reason: "This is a bank's published routing number, not personal." },
    ])
  })

  it('defaults a candidate the model never addressed to sensitive, not cleared', async () => {
    mockFetch(() => llmResponse(JSON.stringify([{ id: 'candidate-0', is_sensitive: false, reason: 'not personal' }])))

    const result = await reviewAmbiguousPii({ text: 'irrelevant', candidates: CANDIDATES, provider: groq, apiKey: 'k', model: 'm' })

    const second = result.reviews.find((r) => r.candidate.id === 'candidate-1')!
    expect(second.isSensitive).toBe(true)
    expect(second.reason).toContain('No response')
  })

  it('defaults every candidate to sensitive when the reply is not valid JSON, rather than erroring', async () => {
    mockFetch(() => llmResponse('Sorry, I cannot help with that.'))

    const result = await reviewAmbiguousPii({ text: 'irrelevant', candidates: CANDIDATES, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('reviewed')
    expect(result.reviews.every((r) => r.isSensitive)).toBe(true)
  })

  it('reports llm-error when the provider call fails, without defaulting any candidate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const result = await reviewAmbiguousPii({ text: 'irrelevant', candidates: CANDIDATES, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('llm-error')
    expect(result.reviews).toEqual([])
  })

  it('sends the real candidate id/text/context into the rendered prompt', async () => {
    let capturedBody: string | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(GROQ_URL)
        capturedBody = init.body as string
        return llmResponse('[]')
      }),
    )

    await reviewAmbiguousPii({ text: 'irrelevant', candidates: CANDIDATES, provider: groq, apiKey: 'k', model: 'm' })

    expect(capturedBody).toContain('candidate-0')
    expect(capturedBody).toContain('923-45-6789')
    expect(capturedBody).toContain('Routing Number: 123456789.')
  })
})
