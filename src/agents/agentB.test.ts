import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from '../llm'
import { auditOpposingFiling } from './agentB'

const groq = getProviderDef('groq')!
const GROQ_URL = groq.defaultBaseUrl

const CA_CODES_URL = 'https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml'
const CA_RULES_URL = 'https://www.courts.ca.gov/rules.htm'
const CA_OPINIONS_URL = 'https://www.courts.ca.gov/opinions.htm'

function htmlResponse(text: string): Response {
  return { ok: true, status: 200, text: async () => `<p>${text}</p>` } as Response
}

function llmResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response
}

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

const BASE_PARAMS = { filingText: 'COMPLAINT: Defendant owes $5,000.', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' }

afterEach(() => {
  vi.unstubAllGlobals()
})

const VALID_AUDIT_JSON = JSON.stringify({
  claims_allegations: [{ allegation: 'Defendant owes $5,000', type: 'claim' }],
  procedural_gaps: [{ description: 'Complaint is unverified', rule_citation: 'Cal. Civ. Proc. Code § 446' }],
  factual_contradictions: ['Paragraph 3 conflicts with Paragraph 7'],
  argument_strength_score: 4,
  response_options: [{ title: 'Move to dismiss', legal_basis: 'Cal. Civ. Proc. Code § 430.10(e)', suggested_text: 'Defendant moves...' }],
})

describe('auditOpposingFiling', () => {
  it('proceeds even for an unseeded jurisdiction, per the prompt\'s own "still complete the analysis" instruction', async () => {
    mockFetch({ [GROQ_URL]: () => llmResponse(VALID_AUDIT_JSON) })

    const result = await auditOpposingFiling({ ...BASE_PARAMS, jurisdiction: 'TX' })

    expect(result.status).toBe('audited')
    expect(result.argumentStrengthScore).toBe(4)
  })

  it('parses a real strict-JSON audit reply into typed fields', async () => {
    mockFetch({
      [CA_CODES_URL]: () => htmlResponse('code text'),
      [CA_RULES_URL]: () => htmlResponse('rules text'),
      [CA_OPINIONS_URL]: () => htmlResponse('opinions text'),
      [GROQ_URL]: () => llmResponse(VALID_AUDIT_JSON),
    })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.status).toBe('audited')
    expect(result.claimsAllegations).toEqual([{ allegation: 'Defendant owes $5,000', type: 'claim' }])
    expect(result.proceduralGaps).toEqual([{ description: 'Complaint is unverified', ruleCitation: 'Cal. Civ. Proc. Code § 446' }])
    expect(result.factualContradictions).toEqual(['Paragraph 3 conflicts with Paragraph 7'])
    expect(result.argumentStrengthScore).toBe(4)
    expect(result.responseOptions).toEqual([
      { title: 'Move to dismiss', legalBasis: 'Cal. Civ. Proc. Code § 430.10(e)', suggestedText: 'Defendant moves...' },
    ])
  })

  it('proceeds and reports unreachable sources rather than blocking the audit', async () => {
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
      [GROQ_URL]: () => llmResponse(VALID_AUDIT_JSON),
    })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.status).toBe('audited')
    expect(result.unreachableSources.sort()).toEqual(['California Codes', 'California Courts Opinions', 'California Rules of Court'])
  })

  it('strips a code fence the model wrapped the JSON in', async () => {
    mockFetch({ [GROQ_URL]: () => llmResponse('```json\n' + VALID_AUDIT_JSON + '\n```') })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.status).toBe('audited')
    expect(result.argumentStrengthScore).toBe(4)
  })

  it('drops a malformed array entry instead of failing the whole report', async () => {
    const malformed = JSON.stringify({
      claims_allegations: [{ allegation: 'ok one', type: 'claim' }, { type: 'claim' }],
      procedural_gaps: [],
      factual_contradictions: [],
      argument_strength_score: 5,
      response_options: [],
    })
    mockFetch({ [GROQ_URL]: () => llmResponse(malformed) })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.claimsAllegations).toEqual([{ allegation: 'ok one', type: 'claim' }])
  })

  it('defaults a missing rule_citation to NOT PROVIDED rather than inventing one', async () => {
    const noCorpus = JSON.stringify({
      claims_allegations: [],
      procedural_gaps: [{ description: 'Missing prerequisite' }],
      factual_contradictions: [],
      argument_strength_score: 3,
      response_options: [],
    })
    mockFetch({ [GROQ_URL]: () => llmResponse(noCorpus) })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.proceduralGaps).toEqual([{ description: 'Missing prerequisite', ruleCitation: 'NOT PROVIDED' }])
  })

  it('returns null score rather than guessing when it is missing or not an integer', async () => {
    const badScore = JSON.stringify({
      claims_allegations: [],
      procedural_gaps: [],
      factual_contradictions: [],
      argument_strength_score: 'strong',
      response_options: [],
    })
    mockFetch({ [GROQ_URL]: () => llmResponse(badScore) })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.argumentStrengthScore).toBeNull()
  })

  it('reports parse-error when the reply is not valid JSON at all', async () => {
    mockFetch({ [GROQ_URL]: () => llmResponse('Sorry, I cannot analyze that.') })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.status).toBe('parse-error')
  })

  it('reports llm-error when the provider call fails', async () => {
    mockFetch({
      [GROQ_URL]: () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const result = await auditOpposingFiling(BASE_PARAMS)

    expect(result.status).toBe('llm-error')
  })

  it('sends "NOT PROVIDED" as the corpus placeholder when nothing was retrieved', async () => {
    let capturedBody: string | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(GROQ_URL)
        capturedBody = init.body as string
        return llmResponse(VALID_AUDIT_JSON)
      }),
    )

    await auditOpposingFiling({ ...BASE_PARAMS, jurisdiction: 'TX' })

    expect(capturedBody).toContain('NOT PROVIDED')
  })
})
