import { buildLlmRequest, extractLlmReplyText } from './requestAdapter'
import type { LlmProviderDef } from './providers'

export type TestConnectionOutcome = 'ok' | 'network-or-cors' | 'http-error' | 'no-reply'

export interface TestConnectionResult {
  outcome: TestConnectionOutcome
  detail: string
}

const TEST_PROMPT = 'Reply with exactly one word: OK'

/**
 * The real, empirical answer to "does this provider work from a browser" — this
 * app's own architecture doc flagged that as an open risk to verify, not assume
 * (see the plan's Stage 8 pivot notes), and this is where that verification
 * actually happens: a real minimal request, from the user's own browser, against
 * the user's own account. `expectedDirectBrowserSupport` on the provider
 * definition is only ever a hint for which providers to try first — this function
 * is the one that actually knows.
 *
 * A CORS rejection and a genuine network failure are indistinguishable from
 * JavaScript's perspective (browsers deliberately withhold the real reason from
 * a caught fetch error), so both surface as 'network-or-cors' with an honest
 * explanation of the ambiguity, rather than a confident but potentially wrong
 * diagnosis.
 */
export async function testConnection(provider: LlmProviderDef, apiKey: string, model: string): Promise<TestConnectionResult> {
  const request = buildLlmRequest(provider, apiKey, model, TEST_PROMPT)

  let response: Response
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
  } catch {
    return {
      outcome: 'network-or-cors',
      detail: `Could not reach ${provider.label} directly from the browser. This may mean you're offline, or that ${provider.label} does not allow direct browser requests (a CORS restriction) — the two look identical from here.`,
    }
  }

  if (!response.ok) {
    let bodyText = ''
    try {
      bodyText = await response.text()
    } catch {
      // best-effort only
    }
    return { outcome: 'http-error', detail: `${provider.label} returned HTTP ${response.status}. ${bodyText.slice(0, 200)}`.trim() }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { outcome: 'no-reply', detail: `${provider.label} returned a response that could not be parsed.` }
  }

  const text = extractLlmReplyText(provider, json)
  if (!text) {
    return { outcome: 'no-reply', detail: `${provider.label} responded, but no reply text could be found in its response.` }
  }

  return { outcome: 'ok', detail: `Connected. ${provider.label} replied: "${text.trim().slice(0, 100)}"` }
}
