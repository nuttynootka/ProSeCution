import { buildLlmRequest, extractLlmReplyText, type LlmProviderDef } from '../llm'
import { AGENT_E_REDACTION_ASSIST, renderPromptTemplate } from '../prompts'
import type { PiiCandidate } from '../redaction'

export type AgentEStatus = 'no-candidates' | 'reviewed' | 'llm-error'

export interface AgentEReview {
  candidate: PiiCandidate
  isSensitive: boolean
  reason: string
}

export interface AgentEResult {
  status: AgentEStatus
  reviews: AgentEReview[]
}

export interface AskAgentEParams {
  text: string
  candidates: PiiCandidate[]
  provider: LlmProviderDef
  apiKey: string
  model: string
}

/**
 * A candidate the model's reply didn't cover — a malformed/incomplete response, or
 * a hallucinated id that doesn't match anything actually sent — defaults to
 * "sensitive" rather than "safe". Redaction is the one place in this app where the
 * failure mode of *not* being told something is fine has to be treated as
 * potentially-still-PII, not silently cleared; the user still reviews and can
 * uncheck it in the redaction panel like any other suggested match.
 */
function defaultToSensitive(candidate: PiiCandidate, reason: string): AgentEReview {
  return { candidate, isSensitive: true, reason }
}

function parseReviewEntries(replyText: string): Map<string, { isSensitive: boolean; reason: string }> {
  const byId = new Map<string, { isSensitive: boolean; reason: string }>()
  let parsed: unknown
  try {
    const cleaned = replyText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    return byId
  }
  if (!Array.isArray(parsed)) return byId

  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.is_sensitive !== 'boolean') continue
    byId.set(entry.id, { isSensitive: entry.is_sensitive, reason: typeof entry.reason === 'string' ? entry.reason : '' })
  }
  return byId
}

/**
 * Client-side orchestration for Agent E — the hand-drafted (not blueprint) PII
 * redaction assistant (Chunk 32) — asked only about candidates the rule-based
 * engine's own precision checks flagged as ambiguous (`detectAmbiguousPii`,
 * Chunk 41), never about the confident matches `detectPii` already trusts on its
 * own. Every candidate the model doesn't clearly clear stays flagged as sensitive
 * by default (see `defaultToSensitive`) — the review panel still lets the user
 * uncheck a false positive, same as any other suggested redaction.
 */
export async function reviewAmbiguousPii(params: AskAgentEParams): Promise<AgentEResult> {
  if (params.candidates.length === 0) {
    return { status: 'no-candidates', reviews: [] }
  }

  const prompt = renderPromptTemplate(AGENT_E_REDACTION_ASSIST.template, {
    candidates: params.candidates.map((c) => ({ id: c.id, text: c.text, context: c.context })),
  })
  const request = buildLlmRequest(params.provider, params.apiKey, params.model, prompt)

  let response: Response
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
  } catch {
    return { status: 'llm-error', reviews: [] }
  }
  if (!response.ok) {
    return { status: 'llm-error', reviews: [] }
  }

  const json = await response.json()
  const replyText = extractLlmReplyText(params.provider, json)
  if (!replyText) {
    return { status: 'llm-error', reviews: [] }
  }

  const byId = parseReviewEntries(replyText)
  const reviews = params.candidates.map((candidate) => {
    const entry = byId.get(candidate.id)
    if (!entry) return defaultToSensitive(candidate, 'No response from the AI reviewer for this item — kept flagged to be safe.')
    return { candidate, isSensitive: entry.isSensitive, reason: entry.reason }
  })
  return { status: 'reviewed', reviews }
}
