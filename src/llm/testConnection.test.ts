import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProviderDef } from './providers'
import { testConnection } from './testConnection'

const groq = getProviderDef('groq')!

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('testConnection', () => {
  it('reports ok with the real reply text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
      }),
    )
    const result = await testConnection(groq, 'gsk_test', 'llama-3.3-70b-versatile')
    expect(result.outcome).toBe('ok')
    expect(result.detail).toContain('OK')
  })

  it('reports network-or-cors honestly on a fetch failure, without claiming to know which it was', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await testConnection(groq, 'gsk_test', 'llama-3.3-70b-versatile')
    expect(result.outcome).toBe('network-or-cors')
    expect(result.detail).toContain('CORS')
  })

  it('reports a non-OK HTTP status distinctly, including the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"invalid api key"}' }),
    )
    const result = await testConnection(groq, 'bad-key', 'llama-3.3-70b-versatile')
    expect(result.outcome).toBe('http-error')
    expect(result.detail).toContain('401')
    expect(result.detail).toContain('invalid api key')
  })

  it('reports no-reply when the response parses but has no extractable text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [] }) }))
    const result = await testConnection(groq, 'gsk_test', 'llama-3.3-70b-versatile')
    expect(result.outcome).toBe('no-reply')
  })
})
