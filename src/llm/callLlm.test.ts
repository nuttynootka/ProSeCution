import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callLlm, resetLlmCircuits } from './callLlm'
import { getProviderDef } from './providers'

const groq = getProviderDef('groq')!
const anthropic = getProviderDef('anthropic')!

function okResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as Response
}

beforeEach(() => {
  resetLlmCircuits()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callLlm', () => {
  it('returns the model reply on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('a real answer')))

    const result = await callLlm(groq, 'k', 'm', 'prompt')

    expect(result).toEqual({ text: 'a real answer', circuitOpen: false })
  })

  it('reports a plain failure (not circuit-open) for the first few network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const first = await callLlm(groq, 'k', 'm', 'prompt')
    const second = await callLlm(groq, 'k', 'm', 'prompt')

    expect(first).toEqual({ text: null, circuitOpen: false })
    expect(second).toEqual({ text: null, circuitOpen: false })
  })

  it('opens the circuit after three consecutive failures and then stops calling the network at all', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchSpy)

    for (let i = 0; i < 3; i++) await callLlm(groq, 'k', 'm', 'prompt')
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    // The whole point: this one fails instantly instead of waiting out another
    // network timeout, and says *why* it failed differently.
    const fourth = await callLlm(groq, 'k', 'm', 'prompt')

    expect(fourth).toEqual({ text: null, circuitOpen: true })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('counts a non-OK HTTP status as a failure — a wrong API key trips it just as fast', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401 }) as Response)
    vi.stubGlobal('fetch', fetchSpy)

    for (let i = 0; i < 3; i++) await callLlm(groq, 'k', 'm', 'prompt')
    const fourth = await callLlm(groq, 'k', 'm', 'prompt')

    expect(fourth.circuitOpen).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('counts an OK response that parsed to nothing usable as a failure too', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ error: 'nope' }) }) as Response)
    vi.stubGlobal('fetch', fetchSpy)

    for (let i = 0; i < 3; i++) await callLlm(groq, 'k', 'm', 'prompt')

    expect((await callLlm(groq, 'k', 'm', 'prompt')).circuitOpen).toBe(true)
  })

  it('resets the failure count on a success, so intermittent errors never trip it', async () => {
    let shouldFail = true
    const fetchSpy = vi.fn(async () => {
      if (shouldFail) throw new TypeError('Failed to fetch')
      return okResponse('recovered')
    })
    vi.stubGlobal('fetch', fetchSpy)

    await callLlm(groq, 'k', 'm', 'p')
    await callLlm(groq, 'k', 'm', 'p')
    shouldFail = false
    await callLlm(groq, 'k', 'm', 'p') // success resets the counter
    shouldFail = true
    await callLlm(groq, 'k', 'm', 'p')
    await callLlm(groq, 'k', 'm', 'p')

    // Four total failures, but never three in a row — still closed.
    expect((await callLlm(groq, 'k', 'm', 'p')).circuitOpen).toBe(false)
  })

  it('keeps providers isolated — one dead provider never locks out a working one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === groq.defaultBaseUrl) throw new TypeError('Failed to fetch')
        // Anthropic's Messages API has its own response shape, not OpenAI's —
        // returning the wrong one here would fail for the wrong reason.
        return { ok: true, status: 200, json: async () => ({ content: [{ text: 'anthropic is fine' }] }) } as Response
      }),
    )

    for (let i = 0; i < 3; i++) await callLlm(groq, 'k', 'm', 'p')

    expect((await callLlm(groq, 'k', 'm', 'p')).circuitOpen).toBe(true)
    expect(await callLlm(anthropic, 'k', 'm', 'p')).toEqual({ text: 'anthropic is fine', circuitOpen: false })
  })
})
