import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from '../llm'
import { askAgentD } from './agentD'

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

/** Source URLs are routed by exact match (concurrent fetches, order not guaranteed); every other call is assumed to be a sequential LLM call and served from `llmQueue` in order — outline generation is always awaited to completion before draft, and draft before critique, so FIFO is safe here even though every LLM call hits the same URL. */
function mockFetch(llmQueue: (() => Promise<Response> | Response)[]) {
  const sourceHandlers: Record<string, () => Promise<Response> | Response> = {
    [CA_CODES_URL]: () => htmlResponse('code text'),
    [CA_RULES_URL]: () => htmlResponse('rules text'),
    [CA_OPINIONS_URL]: () => htmlResponse('opinions text'),
  }
  const queue = [...llmQueue]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const sourceHandler = sourceHandlers[url]
      if (sourceHandler) return sourceHandler()
      const next = queue.shift()
      if (!next) throw new Error(`Unexpected extra fetch to ${url}`)
      return next()
    }),
  )
}

const BASE_PARAMS = { motionTitle: 'Motion to Dismiss', factsSummary: 'The defendant breached the lease.', jurisdiction: 'CA', provider: groq, apiKey: 'k', model: 'm' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askAgentD', () => {
  it('is honest about an unseeded jurisdiction without ever calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await askAgentD({ ...BASE_PARAMS, jurisdiction: 'TX' })

    expect(result.status).toBe('no-sources')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports retrieval-failed and never calls the LLM when every source fails', async () => {
    const llmSpy = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if ([CA_CODES_URL, CA_RULES_URL, CA_OPINIONS_URL].includes(url)) throw new TypeError('Failed to fetch')
        return llmSpy()
      }),
    )

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('retrieval-failed')
    expect(llmSpy).not.toHaveBeenCalled()
  })

  it('runs the full three-stage pipeline and returns the final critiqued draft', async () => {
    mockFetch([
      () => llmResponse('{"sections":[{"heading":"Argument","citations":["[California Codes]"]}]}'),
      () => llmResponse('DRAFT: full motion body citing [California Codes].'),
      () => llmResponse('FINAL: revised motion body.'),
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('drafted')
    expect(result.outlineText).toContain('California Codes')
    expect(result.draftText).toContain('DRAFT:')
    expect(result.finalText).toBe('FINAL: revised motion body.')
  })

  it('regenerates the outline once when it cites something not in the corpus, and succeeds if the retry is clean', async () => {
    mockFetch([
      () => llmResponse('{"sections":[{"citations":["[Some Made Up Statute]"]}]}'), // bad
      () => llmResponse('{"sections":[{"citations":["[California Codes]"]}]}'), // regenerated, clean
      () => llmResponse('DRAFT body.'),
      () => llmResponse('FINAL body.'),
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('drafted')
    expect(result.outlineText).toContain('California Codes')
  })

  it('reports outline-uncited (and never drafts) when the regenerated outline is still uncited', async () => {
    const draftSpy = vi.fn()
    mockFetch([
      () => llmResponse('{"sections":[{"citations":["[Fake One]"]}]}'),
      () => llmResponse('{"sections":[{"citations":["[Fake Two]"]}]}'),
      draftSpy,
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('outline-uncited')
    expect(result.uncitedOutlineCitations).toEqual(['Fake Two'])
    expect(draftSpy).not.toHaveBeenCalled()
  })

  it('falls back to scanning the raw reply when the outline is not valid JSON, rather than crashing', async () => {
    mockFetch([
      () => llmResponse('Not JSON, but mentions [California Codes] anyway.'),
      () => llmResponse('DRAFT body.'),
      () => llmResponse('FINAL body.'),
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('drafted')
  })

  it('reports outline-error when the outline LLM call itself fails', async () => {
    mockFetch([
      () => {
        throw new TypeError('Failed to fetch')
      },
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('outline-error')
  })

  it('reports draft-error when the draft stage fails, keeping the outline that succeeded', async () => {
    mockFetch([
      () => llmResponse('{"sections":[{"citations":["[California Codes]"]}]}'),
      () => {
        throw new TypeError('Failed to fetch')
      },
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('draft-error')
    expect(result.outlineText).toContain('California Codes')
  })

  it('reports critique-error when the critique stage fails, keeping the outline and draft that succeeded', async () => {
    mockFetch([
      () => llmResponse('{"sections":[{"citations":["[California Codes]"]}]}'),
      () => llmResponse('DRAFT body.'),
      () => {
        throw new TypeError('Failed to fetch')
      },
    ])

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('critique-error')
    expect(result.draftText).toBe('DRAFT body.')
  })

  it('reports which sources were unreachable while still completing with whatever succeeded', async () => {
    const llmQueue = [
      () => llmResponse('{"sections":[{"citations":["[California Codes]"]}]}'),
      () => llmResponse('DRAFT body.'),
      () => llmResponse('FINAL body.'),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === CA_CODES_URL) return htmlResponse('code text')
        if (url === CA_RULES_URL || url === CA_OPINIONS_URL) throw new TypeError('Failed to fetch')
        if (url === GROQ_URL) {
          const next = llmQueue.shift()
          if (!next) throw new Error('Unexpected extra LLM call')
          return next()
        }
        throw new Error(`unexpected ${url}`)
      }),
    )

    const result = await askAgentD(BASE_PARAMS)

    expect(result.status).toBe('drafted')
    expect(result.unreachableSources.sort()).toEqual(['California Courts Opinions', 'California Rules of Court'])
  })
})
