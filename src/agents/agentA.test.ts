import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from '../llm'
import { askAgentA } from './agentA'

const groq = getProviderDef('groq')!
const GROQ_URL = groq.defaultBaseUrl

// The real, always-relevant CA sources (legalSourcesFor('CA') with no case type).
const CA_CODES_URL = 'https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml'
const CA_RULES_URL = 'https://www.courts.ca.gov/rules.htm'
const CA_OPINIONS_URL = 'https://www.courts.ca.gov/opinions.htm'

function mockFetch(handlers: Record<string, () => Promise<Response> | Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const handler = handlers[url]
      if (!handler) throw new Error(`Unexpected fetch: ${url}`)
      return handler()
    }),
  )
}

function htmlResponse(text: string): Response {
  return { ok: true, status: 200, text: async () => `<p>${text}</p>` } as Response
}

function llmResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askAgentA', () => {
  it('is honest about an unseeded jurisdiction without ever calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await askAgentA({ query: 'How long do I have?', jurisdiction: 'TX', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('no-sources')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers with real retrieved content and correctly splits verified from unverified citations', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('code text'),
      [CA_RULES_URL]: () => htmlResponse('rules text'),
      [CA_OPINIONS_URL]: () => htmlResponse('opinions text'),
      [GROQ_URL]: () =>
        llmResponse('You must respond within 30 days [California Codes]. See also [Some Made Up Statute].'),
    })

    const result = await askAgentA({ query: 'How long?', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('answered')
    expect(result.verifiedCitations).toEqual([{ sourceRef: 'California Codes', sourceUrl: CA_CODES_URL }])
    expect(result.unverifiedCitations).toEqual(['Some Made Up Statute'])
  })

  it('detects the out-of-bounds sentinel and does not attempt citation verification', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('code text'),
      [CA_RULES_URL]: () => htmlResponse('rules text'),
      [CA_OPINIONS_URL]: () => htmlResponse('opinions text'),
      [GROQ_URL]: () => llmResponse('ERR_OUT_OF_BOUNDS_LEGAL_CORPUS Missing: specific fee schedule.'),
    })

    const result = await askAgentA({ query: 'How much does X cost?', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('out-of-bounds')
    expect(result.answerText).toContain('Missing: specific fee schedule')
    expect(result.verifiedCitations).toEqual([])
  })

  it('proceeds with whatever sources succeeded when some fail, and reports the ones that did not', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('code text'),
      [CA_RULES_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
      [CA_OPINIONS_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
      [GROQ_URL]: () => llmResponse('An answer using [California Codes].'),
    })

    const result = await askAgentA({ query: 'q', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('answered')
    expect(result.unreachableSources.sort()).toEqual(['California Courts Opinions', 'California Rules of Court'])
  })

  it('reports retrieval-failed and never calls the LLM when every source fails', async () => {
    const llmSpy = vi.fn()
    mockFetch({
      [CA_CODES_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
      [CA_RULES_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
      [CA_OPINIONS_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
      [GROQ_URL]: llmSpy,
    })

    const result = await askAgentA({ query: 'q', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('retrieval-failed')
    expect(llmSpy).not.toHaveBeenCalled()
  })

  it('reports llm-error when the provider call itself fails', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('code text'),
      [CA_RULES_URL]: () => htmlResponse('rules text'),
      [CA_OPINIONS_URL]: () => htmlResponse('opinions text'),
      [GROQ_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const result = await askAgentA({ query: 'q', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('llm-error')
  })

  it('flags a source whose fetched text had to be truncated', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('x'.repeat(5000)),
      [CA_RULES_URL]: () => htmlResponse('short'),
      [CA_OPINIONS_URL]: () => htmlResponse('short'),
      [GROQ_URL]: () => llmResponse('An answer.'),
    })

    const result = await askAgentA({ query: 'q', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' })

    expect(result.truncatedSources).toEqual(['California Codes'])
  })
})
