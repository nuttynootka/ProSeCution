import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractPlainText, fetchSourceText, FetchSourceTextFailure } from './fetchSourceText'

describe('extractPlainText', () => {
  it('strips tags and collapses whitespace', () => {
    const html = '<html><body><h1>Title</h1>\n<p>Some   text.</p></body></html>'
    expect(extractPlainText(html)).toBe('Title Some text.')
  })

  it('drops script and style content entirely, not just their tags', () => {
    const html = '<style>.x{color:red}</style><script>alert(1)</script><p>Real content</p>'
    expect(extractPlainText(html)).toBe('Real content')
  })

  it('decodes common HTML entities', () => {
    expect(extractPlainText('<p>Fish &amp; Chips &quot;great&quot;</p>')).toBe('Fish & Chips "great"')
  })
})

describe('fetchSourceText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the extracted text on a real success response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<p>Real statute text</p>' }),
    )
    expect(await fetchSourceText('https://example.gov/code')).toBe('Real statute text')
  })

  it('reports a network failure honestly — this is also what a CORS block looks like from here', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchSourceText('https://example.gov/code')).rejects.toMatchObject({
      reason: 'network',
    } satisfies Partial<FetchSourceTextFailure>)
  })

  it('reports a non-OK HTTP status distinctly from a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' }))
    await expect(fetchSourceText('https://example.gov/missing')).rejects.toMatchObject({ reason: 'http-error' })
  })

  it('reports a page with no readable text distinctly, rather than returning an empty string silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<script>x</script>' }))
    await expect(fetchSourceText('https://example.gov/blank')).rejects.toMatchObject({ reason: 'empty' })
  })
})
