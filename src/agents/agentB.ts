import { buildLlmRequest, extractLlmReplyText, type LlmProviderDef } from '../llm'
import { AGENT_B_OPPOSING_FILING_AUDITOR, renderPromptTemplate } from '../prompts'
import { retrieveLegalChunks, serializeChunksForPrompt } from './retrieval'

export type AgentBStatus = 'llm-error' | 'parse-error' | 'audited'

export interface AgentBClaim {
  allegation: string
  type: string
}

export interface AgentBProceduralGap {
  description: string
  ruleCitation: string
}

export interface AgentBResponseOption {
  title: string
  legalBasis: string
  suggestedText: string
}

export interface AgentBResult {
  status: AgentBStatus
  claimsAllegations: AgentBClaim[]
  proceduralGaps: AgentBProceduralGap[]
  factualContradictions: string[]
  /** Null when the model didn't return a usable integer — never guessed at. */
  argumentStrengthScore: number | null
  responseOptions: AgentBResponseOption[]
  /** Sources that could not be fetched — per the prompt's own instruction, the audit still proceeds without them (gaps get "NOT PROVIDED" citations), it just isn't blocked the way Agent A/D are on a missing corpus. */
  unreachableSources: string[]
}

export interface AskAgentBParams {
  filingText: string
  jurisdiction: string
  caseType?: string
  provider: LlmProviderDef
  apiKey: string
  model: string
}

const EMPTY_ANALYSIS: Omit<AgentBResult, 'status' | 'unreachableSources'> = {
  claimsAllegations: [],
  proceduralGaps: [],
  factualContradictions: [],
  argumentStrengthScore: null,
  responseOptions: [],
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseClaims(raw: unknown): AgentBClaim[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .filter((c) => typeof c.allegation === 'string' && typeof c.type === 'string')
    .map((c) => ({ allegation: c.allegation as string, type: c.type as string }))
}

function parseGaps(raw: unknown): AgentBProceduralGap[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .filter((g) => typeof g.description === 'string')
    .map((g) => ({ description: g.description as string, ruleCitation: typeof g.rule_citation === 'string' ? g.rule_citation : 'NOT PROVIDED' }))
}

function parseResponseOptions(raw: unknown): AgentBResponseOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .filter((r) => typeof r.title === 'string')
    .map((r) => ({
      title: r.title as string,
      legalBasis: typeof r.legal_basis === 'string' ? r.legal_basis : 'NOT PROVIDED',
      suggestedText: typeof r.suggested_text === 'string' ? r.suggested_text : '',
    }))
}

/** Parses the model's strict-JSON audit reply, treating every field as optional/malformed-tolerant — a real model doesn't always follow "no text outside the JSON" exactly, so a code-fence is stripped, and any array entry missing its required string fields is dropped rather than crashing the whole report. Returns null only when the top-level JSON itself can't be parsed at all. */
function parseAuditReply(replyText: string): Omit<AgentBResult, 'status' | 'unreachableSources'> | null {
  let parsed: unknown
  try {
    const cleaned = replyText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const score = parsed.argument_strength_score
  return {
    claimsAllegations: parseClaims(parsed.claims_allegations),
    proceduralGaps: parseGaps(parsed.procedural_gaps),
    factualContradictions: Array.isArray(parsed.factual_contradictions) ? parsed.factual_contradictions.filter((c): c is string => typeof c === 'string') : [],
    argumentStrengthScore: typeof score === 'number' && Number.isInteger(score) ? score : null,
    responseOptions: parseResponseOptions(parsed.response_options),
  }
}

/**
 * Client-side orchestration for the blueprint's Agent B — Opposing Filing Auditor
 * (Chunk 44), using the prompt already stored verbatim from Chunk 32. Unlike Agent
 * A/D, the prompt itself says to proceed even with no local rules available
 * ("still complete the analysis but mark each gap with rule_citation: NOT
 * PROVIDED... Never invent a rule") — so retrieval failures here are surfaced
 * (`unreachableSources`) but never block the audit from running, matching that
 * explicit instruction rather than the stricter grounded-or-nothing behavior Agent
 * A/D need for their own different purposes.
 */
export async function auditOpposingFiling(params: AskAgentBParams): Promise<AgentBResult> {
  const { chunks, unreachable } = await retrieveLegalChunks(params.jurisdiction, params.caseType)
  const unreachableSources = unreachable.map((s) => s.label)
  const legalCorpus = chunks.length > 0 ? serializeChunksForPrompt(chunks) : 'NOT PROVIDED'

  const prompt = renderPromptTemplate(AGENT_B_OPPOSING_FILING_AUDITOR.template, {
    filing_text: params.filingText,
    retrieved_legal_chunks: legalCorpus,
  })
  const request = buildLlmRequest(params.provider, params.apiKey, params.model, prompt)

  let response: Response
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
  } catch {
    return { status: 'llm-error', ...EMPTY_ANALYSIS, unreachableSources }
  }
  if (!response.ok) {
    return { status: 'llm-error', ...EMPTY_ANALYSIS, unreachableSources }
  }

  const json = await response.json()
  const replyText = extractLlmReplyText(params.provider, json)
  if (!replyText) {
    return { status: 'llm-error', ...EMPTY_ANALYSIS, unreachableSources }
  }

  const parsed = parseAuditReply(replyText)
  if (!parsed) {
    return { status: 'parse-error', ...EMPTY_ANALYSIS, unreachableSources }
  }

  return { status: 'audited', ...parsed, unreachableSources }
}
