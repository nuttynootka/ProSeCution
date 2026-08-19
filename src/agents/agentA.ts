import { legalSourcesFor, fetchSourceText, type LegalSource } from '../legalSources'
import { buildLlmRequest, extractLlmReplyText, type LlmProviderDef } from '../llm'
import { AGENT_A_GROUNDED_QA, renderPromptTemplate } from '../prompts'

const OUT_OF_BOUNDS_SENTINEL = 'ERR_OUT_OF_BOUNDS_LEGAL_CORPUS'
/** Each source's fetched page is truncated to this many characters before being handed to the model — this app does real chunked, pinpoint retrieval nowhere; a fetched government page can be huge, and there's no embeddings-based passage selection (Stage 8's whole point was avoiding that infrastructure). This is an honest, disclosed limitation, not hidden: see AgentAResult.truncatedSources. */
const MAX_CHUNK_CHARS = 4000

export type AgentAStatus = 'answered' | 'out-of-bounds' | 'no-sources' | 'retrieval-failed' | 'llm-error'

export interface AgentACitation {
  sourceRef: string
  sourceUrl: string
}

export interface AgentAResult {
  status: AgentAStatus
  /** The model's raw answer text (out-of-bounds explanation included) — empty for no-sources/retrieval-failed/llm-error. */
  answerText: string
  /** Citations in the answer that matched a real, provided source — safe to show as verified links. */
  verifiedCitations: AgentACitation[]
  /** Bracketed spans in the answer that looked like citations but didn't match any source actually provided — the anti-hallucination signal this exists for. */
  unverifiedCitations: string[]
  /** Sources that were included but had to be cut short at MAX_CHUNK_CHARS. */
  truncatedSources: string[]
  /** Sources that were skipped because they could not be fetched (network/CORS/HTTP error) — the query still proceeds with whatever did succeed. */
  unreachableSources: string[]
}

export interface AskAgentAParams {
  query: string
  jurisdiction: string
  caseType?: string
  provider: LlmProviderDef
  apiKey: string
  model: string
}

interface RetrievedChunk {
  source: LegalSource
  text: string
  truncated: boolean
}

async function retrieveChunks(jurisdiction: string, caseType: string | undefined): Promise<{
  chunks: RetrievedChunk[]
  unreachable: LegalSource[]
}> {
  const sources = legalSourcesFor(jurisdiction, caseType)
  const chunks: RetrievedChunk[] = []
  const unreachable: LegalSource[] = []

  const results = await Promise.allSettled(sources.map((source) => fetchSourceText(source.url)))
  results.forEach((result, i) => {
    const source = sources[i]
    if (result.status === 'rejected') {
      unreachable.push(source)
      return
    }
    const truncated = result.value.length > MAX_CHUNK_CHARS
    chunks.push({ source, text: truncated ? result.value.slice(0, MAX_CHUNK_CHARS) : result.value, truncated })
  })

  return { chunks, unreachable }
}

/** Every `[...]`-bracketed span in the answer, checked against the real source labels actually provided — the model is instructed to cite using exactly that label (see AGENT_A_GROUNDED_QA's RULES), so anything else in brackets is either a hallucinated citation or genuinely not one. */
function verifyCitations(answerText: string, chunks: RetrievedChunk[]): { verified: AgentACitation[]; unverified: string[] } {
  const byLabel = new Map(chunks.map((c) => [c.source.label, c.source]))
  const found = [...answerText.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim())

  const verified: AgentACitation[] = []
  const unverified: string[] = []
  const seen = new Set<string>()
  for (const ref of found) {
    if (seen.has(ref)) continue
    seen.add(ref)
    const source = byLabel.get(ref)
    if (source) verified.push({ sourceRef: ref, sourceUrl: source.url })
    else unverified.push(ref)
  }
  return { verified, unverified }
}

/**
 * Client-side orchestration for the blueprint's Agent A — Grounded RAG Enforcer.
 * Scopes retrieval to the case's own jurisdiction/case type (Chunk 30), fetches
 * those sources live (Chunk 31), renders the blueprint's own prompt (Chunk 32),
 * calls whichever provider the user configured (Chunk 38), and verifies every
 * citation the model produced actually matches a source it was really given —
 * the concrete anti-hallucination check the plan calls for, not just trusting the
 * prompt's own instructions to behave.
 */
export async function askAgentA(params: AskAgentAParams): Promise<AgentAResult> {
  if (legalSourcesFor(params.jurisdiction, params.caseType).length === 0) {
    return {
      status: 'no-sources',
      answerText: '',
      verifiedCitations: [],
      unverifiedCitations: [],
      truncatedSources: [],
      unreachableSources: [],
    }
  }

  const { chunks, unreachable } = await retrieveChunks(params.jurisdiction, params.caseType)

  if (chunks.length === 0) {
    return {
      status: 'retrieval-failed',
      answerText: '',
      verifiedCitations: [],
      unverifiedCitations: [],
      truncatedSources: [],
      unreachableSources: unreachable.map((s) => s.label),
    }
  }

  const prompt = renderPromptTemplate(AGENT_A_GROUNDED_QA.template, {
    retrieved_chunks: chunks.map((c) => ({ source_ref: c.source.label, chunk_text: c.text })),
    user_query: params.query,
  })

  const request = buildLlmRequest(params.provider, params.apiKey, params.model, prompt)
  let response: Response
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) })
  } catch {
    return {
      status: 'llm-error',
      answerText: '',
      verifiedCitations: [],
      unverifiedCitations: [],
      truncatedSources: chunks.filter((c) => c.truncated).map((c) => c.source.label),
      unreachableSources: unreachable.map((s) => s.label),
    }
  }

  if (!response.ok) {
    return {
      status: 'llm-error',
      answerText: '',
      verifiedCitations: [],
      unverifiedCitations: [],
      truncatedSources: chunks.filter((c) => c.truncated).map((c) => c.source.label),
      unreachableSources: unreachable.map((s) => s.label),
    }
  }

  const json = await response.json()
  const answerText = extractLlmReplyText(params.provider, json)
  if (!answerText) {
    return {
      status: 'llm-error',
      answerText: '',
      verifiedCitations: [],
      unverifiedCitations: [],
      truncatedSources: chunks.filter((c) => c.truncated).map((c) => c.source.label),
      unreachableSources: unreachable.map((s) => s.label),
    }
  }

  const truncatedSources = chunks.filter((c) => c.truncated).map((c) => c.source.label)
  const unreachableSources = unreachable.map((s) => s.label)

  if (answerText.includes(OUT_OF_BOUNDS_SENTINEL)) {
    return { status: 'out-of-bounds', answerText, verifiedCitations: [], unverifiedCitations: [], truncatedSources, unreachableSources }
  }

  const { verified, unverified } = verifyCitations(answerText, chunks)
  return { status: 'answered', answerText, verifiedCitations: verified, unverifiedCitations: unverified, truncatedSources, unreachableSources }
}
