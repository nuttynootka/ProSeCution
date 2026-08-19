import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from '../llm'
import type { PdfTextItem } from '../pdf'
import { suggestFieldsFromPage } from './agentC'

const groq = getProviderDef('groq')!
const GROQ_URL = groq.defaultBaseUrl

const SAMPLE_ITEMS: PdfTextItem[] = [
  { text: 'Plaintiff Name:', boundingBox: { left: 72, top: 100, width: 100, height: 12 } },
  { text: '', boundingBox: { left: 200, top: 100, width: 0, height: 0 } },
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

describe('suggestFieldsFromPage', () => {
  it('reports no-text and never calls the LLM when the page has no real text items', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await suggestFieldsFromPage({ textItems: [], provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('no-text')
    expect(result.fields).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats a page whose only items are blank/whitespace as no-text too', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await suggestFieldsFromPage({
      textItems: [{ text: '   ', boundingBox: { left: 0, top: 0, width: 1, height: 1 } }],
      provider: groq,
      apiKey: 'k',
      model: 'm',
    })

    expect(result.status).toBe('no-text')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('parses a real JSON array response into typed fields, including a MULTI_LINE_RULED one', async () => {
    mockFetch(() =>
      llmResponse(
        JSON.stringify([
          {
            field_id: 'f1',
            type: 'SINGLE_LINE',
            bounding_box: { left: 150, top: 100, width: 200, height: 14 },
            label: 'Plaintiff Name',
            suggested_global_key: 'party_plaintiff_name',
          },
          {
            field_id: 'f2',
            type: 'MULTI_LINE_RULED',
            bounding_box: { left: 72, top: 300, width: 400, height: 60 },
            label: 'Statement of facts',
            baseline_y_offset: 3,
            line_height: 18,
            max_lines: 4,
          },
        ]),
      ),
    )

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('suggested')
    expect(result.fields).toEqual([
      {
        fieldId: 'f1',
        type: 'SINGLE_LINE',
        boundingBox: { left: 150, top: 100, width: 200, height: 14 },
        label: 'Plaintiff Name',
        suggestedGlobalKey: 'plaintiff.name',
      },
      {
        fieldId: 'f2',
        type: 'MULTI_LINE_RULED',
        boundingBox: { left: 72, top: 300, width: 400, height: 60 },
        label: 'Statement of facts',
        suggestedGlobalKey: undefined,
        baselineYOffset: 3,
        lineHeight: 18,
        maxLines: 4,
      },
    ])
  })

  it('strips a code fence the model wrapped the JSON array in', async () => {
    mockFetch(() =>
      llmResponse(
        '```json\n' +
          JSON.stringify([{ field_id: 'f1', type: 'SINGLE_LINE', bounding_box: { left: 0, top: 0, width: 10, height: 10 } }]) +
          '\n```',
      ),
    )

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('suggested')
    expect(result.fields).toHaveLength(1)
  })

  it('drops an entry missing a usable bounding box instead of crashing the whole batch', async () => {
    mockFetch(() =>
      llmResponse(
        JSON.stringify([
          { field_id: 'bad', type: 'SINGLE_LINE' },
          { field_id: 'good', type: 'SINGLE_LINE', bounding_box: { left: 0, top: 0, width: 10, height: 10 } },
        ]),
      ),
    )

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.fields.map((f) => f.fieldId)).toEqual(['good'])
  })

  it('returns no fields, not an error, when the model reply is not valid JSON', async () => {
    mockFetch(() => llmResponse('Sorry, I cannot do that.'))

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('suggested')
    expect(result.fields).toEqual([])
  })

  it('reports llm-error when the provider call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('llm-error')
  })

  it('reports llm-error on a non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))

    const result = await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(result.status).toBe('llm-error')
  })

  it('sends the real Groq endpoint with the serialized text+bbox data in the prompt', async () => {
    let capturedBody: string | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(GROQ_URL)
        capturedBody = init.body as string
        return llmResponse('[]')
      }),
    )

    await suggestFieldsFromPage({ textItems: SAMPLE_ITEMS, provider: groq, apiKey: 'k', model: 'm' })

    expect(capturedBody).toContain('Plaintiff Name:')
    expect(capturedBody).toContain('72,100,100,12')
  })
})
