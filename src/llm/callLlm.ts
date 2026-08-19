import { CircuitBreaker } from '../network'
import { buildLlmRequest, extractLlmReplyText } from './requestAdapter'
import type { LlmProviderDef } from './providers'

/**
 * Opens after this many consecutive failures. Three is deliberately forgiving: a
 * single dropped request or one-off 500 shouldn't lock a provider out, but a wrong
 * API key or a genuinely down service fails every time and trips it immediately.
 */
const FAILURE_THRESHOLD = 3
/** How long a tripped provider stays locked out before one trial call is allowed through. */
const COOLDOWN_MS = 60_000

/**
 * One breaker per provider, not one globally — a dead Ollama server says nothing
 * about whether Groq is reachable, and locking out a working provider because a
 * different one failed would be worse than no breaker at all.
 */
const breakers = new Map<string, CircuitBreaker>()

function breakerFor(providerId: string): CircuitBreaker {
  const existing = breakers.get(providerId)
  if (existing) return existing
  const created = new CircuitBreaker({ failureThreshold: FAILURE_THRESHOLD, cooldownMs: COOLDOWN_MS })
  breakers.set(providerId, created)
  return created
}

/** Clears all recorded failures. Exported for tests, which would otherwise carry a tripped breaker from one case into the next. */
export function resetLlmCircuits(): void {
  breakers.clear()
}

export interface LlmCallResult {
  /** The model's reply, or null if the call didn't produce usable text for any reason. */
  text: string | null
  /**
   * True when this call was refused locally, without touching the network, because
   * the provider has failed repeatedly and is still in cooldown. Distinct from a
   * plain failure so the UI can say "this provider keeps failing" instead of
   * repeating a generic error the user has already seen several times.
   */
  circuitOpen: boolean
}

/**
 * The single place every agent's LLM call goes through (Agents A–E), so the circuit
 * breaker actually protects all of them rather than being wired into one path and
 * forgotten in four others.
 *
 * The real benefit is failing *fast*: once a provider has tripped, further calls
 * return immediately instead of each waiting out its own network timeout, so a user
 * with a wrong API key or an unreachable server gets told in milliseconds rather
 * than sitting through repeated multi-second hangs.
 */
export async function callLlm(
  provider: LlmProviderDef,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<LlmCallResult> {
  const breaker = breakerFor(provider.id)
  if (!breaker.canAttempt()) return { text: null, circuitOpen: true }

  const request = buildLlmRequest(provider, apiKey, model, prompt)

  let response: Response
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
  } catch {
    breaker.recordFailure()
    return { text: null, circuitOpen: false }
  }

  if (!response.ok) {
    breaker.recordFailure()
    return { text: null, circuitOpen: false }
  }

  const json = await response.json()
  const text = extractLlmReplyText(provider, json)
  // A 200 that parsed to nothing usable still counts as this provider misbehaving —
  // it's the shape of a provider returning errors with an OK status, which is exactly
  // the case worth backing off from.
  if (text === null) {
    breaker.recordFailure()
    return { text: null, circuitOpen: false }
  }

  breaker.recordSuccess()
  return { text, circuitOpen: false }
}
