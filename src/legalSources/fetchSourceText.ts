/**
 * Strips a fetched HTML page down to its visible text — deliberately simple (regex,
 * not a full HTML parser/DOM), since this only needs "enough readable text to hand
 * to an LLM as grounding," not a faithful re-render. Scripts/styles are dropped
 * first so their content never leaks into the extracted text, then remaining tags
 * are stripped and entities decoded.
 */
export function extractPlainText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ')
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return decoded.replace(/\s+/g, ' ').trim()
}

export type FetchSourceTextError = 'network' | 'http-error' | 'empty'

export class FetchSourceTextFailure extends Error {
  readonly reason: FetchSourceTextError
  constructor(reason: FetchSourceTextError, message: string) {
    super(message)
    this.name = 'FetchSourceTextFailure'
    this.reason = reason
  }
}

/**
 * Fetches one allowlisted source URL and returns its plain text. This is the one
 * piece of this app's retrieval design that couldn't be empirically verified while
 * building it: this sandbox's own network egress proxy intercepts arbitrary
 * external HTTPS with an invalid certificate (confirmed directly — a real fetch
 * attempt against courts.ca.gov failed here with a cert error, not a CORS error),
 * so there is no way to test from here whether real government sites actually
 * permit direct browser fetches the way this function assumes. That has to be
 * checked for real once this runs on an actual device with normal internet access
 * — flagged here rather than silently assumed. If a given source's server doesn't
 * set permissive CORS headers, `fetch` rejects with a generic, opaque network
 * error (browsers deliberately hide the real reason), which is why "network" below
 * covers both "genuinely offline" and "blocked by CORS" — this function can't tell
 * those apart from the outside, and shouldn't pretend it can.
 */
export async function fetchSourceText(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new FetchSourceTextFailure('network', `Could not reach ${url} — offline, or the site does not allow this.`)
  }

  if (!response.ok) {
    throw new FetchSourceTextFailure('http-error', `${url} returned ${response.status}.`)
  }

  const html = await response.text()
  const text = extractPlainText(html)
  if (!text) {
    throw new FetchSourceTextFailure('empty', `${url} returned no readable text.`)
  }
  return text
}
