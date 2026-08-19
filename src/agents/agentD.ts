import { legalSourcesFor } from '../legalSources'
import { callLlm as callProvider, type LlmProviderDef } from '../llm'
import {
  DRAFTING_CRITIQUE_PROMPT,
  DRAFTING_FULL_DRAFT_PROMPT,
  DRAFTING_OUTLINE_PROMPT,
  renderPromptTemplate,
  styleGuideFor,
} from '../prompts'
import { findUnverifiedCitations, retrieveLegalChunks, serializeChunksForPrompt, type RetrievedChunk } from './retrieval'

export type AgentDStatus =
  | 'provider-unavailable'
  | 'no-sources'
  | 'retrieval-failed'
  | 'outline-error'
  | 'outline-uncited'
  | 'draft-error'
  | 'critique-error'
  | 'drafted'

export interface AgentDResult {
  status: AgentDStatus
  /** Stage 1's raw reply (a JSON outline per the blueprint's own prompt) — kept as text rather than parsed, since the blueprint doesn't specify a field schema beyond "sections array" and the citation check below only needs the raw bracketed spans, not a parsed structure. */
  outlineText: string
  /** Stage 2's plain-text motion body. */
  draftText: string
  /** Stage 3's final, critiqued-and-revised draft — this is what the UPL adoption gate reviews. */
  finalText: string
  /** Populated only when status is 'outline-uncited': citations the outline used that don't match any source actually retrieved, after one regeneration attempt still failed to fix. */
  uncitedOutlineCitations: string[]
  unreachableSources: string[]
}

export interface AskAgentDParams {
  motionTitle: string
  /** The user's own account of the facts — this app has no rich case-narrative field to draw one from automatically (see caseDataResolver.ts's small closed vocabulary), so the drafting screen collects this directly rather than fabricating a summary. */
  factsSummary: string
  jurisdiction: string
  caseType?: string
  provider: LlmProviderDef
  apiKey: string
  model: string
}

const EMPTY_RESULT: Omit<AgentDResult, 'status' | 'unreachableSources'> = {
  outlineText: '',
  draftText: '',
  finalText: '',
  uncitedOutlineCitations: [],
}

/**
 * Every stage of this pipeline goes through the shared, circuit-broken caller.
 * `lastCircuitOpen` is module-level rather than threaded through each stage's
 * return: the pipeline is strictly sequential and fails at the first stage that
 * can't produce text, so the flag is always read immediately after the call that
 * set it, never across an interleaved one.
 */
let lastCircuitOpen = false

async function callLlm(provider: LlmProviderDef, apiKey: string, model: string, prompt: string): Promise<string | null> {
  const result = await callProvider(provider, apiKey, model, prompt)
  lastCircuitOpen = result.circuitOpen
  return result.text
}

/**
 * Client-side orchestration for the blueprint's §8.1 three-stage drafting pipeline
 * (Chunk 43): outline → full draft → critique/revision, using the prompts already
 * stored verbatim from Chunk 32. The outline's own citations are checked against the
 * real retrieved corpus (the same anti-hallucination pattern Agent A uses) — per the
 * blueprint, "if not, the outline is rejected and regenerated"; this regenerates
 * once, with the specific bad citations named, before giving up honestly rather than
 * drafting a full motion on top of an outline that already cited something that
 * doesn't exist in the corpus it was given.
 *
 * The result is never auto-adopted — the caller (Co-Counsel's Drafting tab) is
 * responsible for running `finalText` through the existing UPL AdoptionGate (Chunk
 * 25) before letting a user treat it as their own filed document.
 */
export async function askAgentD(params: AskAgentDParams): Promise<AgentDResult> {
  if (legalSourcesFor(params.jurisdiction, params.caseType).length === 0) {
    return { status: 'no-sources', ...EMPTY_RESULT, unreachableSources: [] }
  }

  const { chunks, unreachable } = await retrieveLegalChunks(params.jurisdiction, params.caseType)
  const unreachableSources = unreachable.map((s) => s.label)

  if (chunks.length === 0) {
    return { status: 'retrieval-failed', ...EMPTY_RESULT, unreachableSources }
  }

  const legalCorpus = serializeChunksForPrompt(chunks)
  const outlineText = await generateVerifiedOutline(params, chunks, legalCorpus)
  if (outlineText === null) {
    return { status: lastCircuitOpen ? 'provider-unavailable' : 'outline-error', ...EMPTY_RESULT, unreachableSources }
  }
  const stillUncited = findUncitedInOutline(outlineText, chunks)
  if (stillUncited.length > 0) {
    return { status: 'outline-uncited', ...EMPTY_RESULT, outlineText, uncitedOutlineCitations: stillUncited, unreachableSources }
  }

  // Blueprint §8.3: "a detailed style guide is appended to the system prompt."
  // Appended to the drafting and critique stages (where formatting actually
  // matters), not the outline stage — an outline has no pleading-paper layout,
  // line numbering, or signature block to get right. Only a jurisdiction with a
  // real seeded guide contributes anything; every other one appends nothing rather
  // than inventing local formatting rules (`styleGuideFor` returns undefined).
  const styleGuide = styleGuideFor(params.jurisdiction)
  const styleGuideBlock = styleGuide ? `\n\nSTYLE GUIDE — follow these local formatting rules exactly:\n${styleGuide.text}` : ''

  const draftPrompt =
    renderPromptTemplate(DRAFTING_FULL_DRAFT_PROMPT.template, { outline: outlineText, retrieved_legal_chunks: legalCorpus }) +
    styleGuideBlock
  const draftText = await callLlm(params.provider, params.apiKey, params.model, draftPrompt)
  if (!draftText) {
    return { status: lastCircuitOpen ? 'provider-unavailable' : 'draft-error', ...EMPTY_RESULT, outlineText, unreachableSources }
  }

  const critiquePrompt = renderPromptTemplate(DRAFTING_CRITIQUE_PROMPT.template, { draft: draftText }) + styleGuideBlock
  const finalText = await callLlm(params.provider, params.apiKey, params.model, critiquePrompt)
  if (!finalText) {
    return { status: lastCircuitOpen ? 'provider-unavailable' : 'critique-error', ...EMPTY_RESULT, outlineText, draftText, unreachableSources }
  }

  return { status: 'drafted', outlineText, draftText, finalText, uncitedOutlineCitations: [], unreachableSources }
}

// The blueprint's own DRAFTING_OUTLINE_PROMPT (verbatim, stored unmodified in the
// registry) asks for "a structured outline ... with citations" but doesn't specify
// what a citation string looks like in the returned JSON — nothing to preserve
// verbatim there. This addendum is this app's own glue, not blueprint text (same
// status as the retry addendum below): it asks for the one concrete, checkable
// format already established elsewhere in this app (Agent A's [Source Label]
// bracket convention), so `extractCitationCandidates` below has something
// deterministic to check.
const CITATION_FORMAT_ADDENDUM =
  '\n\nWrite each citation as a bracketed source label exactly matching a [Source] heading in the LEGAL CORPUS above, e.g. "[California Codes]".'

function collectStringLeaves(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out)
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringLeaves(item, out)
  }
}

/**
 * The outline is JSON, and JSON's own `[...]` array syntax collides with a flat
 * `[...]`-bracket citation scan over the raw text (an array wrapping a bracketed
 * citation string produces nested brackets a non-recursive regex can't parse
 * correctly). Parsing the JSON first and only then bracket-scanning each individual
 * string leaf sidesteps that collision entirely; if the model didn't return valid
 * JSON at all, falling back to scanning the raw text is a strictly worse but still
 * honest degradation, not a silent skip.
 */
function extractOutlineCitationText(outlineText: string): string {
  try {
    const leaves: string[] = []
    collectStringLeaves(JSON.parse(outlineText), leaves)
    return leaves.join(' ')
  } catch {
    return outlineText
  }
}

function findUncitedInOutline(outlineText: string, chunks: RetrievedChunk[]): string[] {
  return findUnverifiedCitations(extractOutlineCitationText(outlineText), chunks)
}

/** Runs the outline stage, and if its citations don't check out, regenerates exactly once with the specific bad ones named — never silently, never in an unbounded loop. Returns null only on a real LLM-call failure (not on a citation problem, which the caller handles via findUncitedInOutline on the returned text). */
async function generateVerifiedOutline(params: AskAgentDParams, chunks: RetrievedChunk[], legalCorpus: string): Promise<string | null> {
  const basePrompt =
    renderPromptTemplate(DRAFTING_OUTLINE_PROMPT.template, {
      facts_summary: params.factsSummary,
      retrieved_legal_chunks: legalCorpus,
    }) + CITATION_FORMAT_ADDENDUM

  const first = await callLlm(params.provider, params.apiKey, params.model, basePrompt)
  if (first === null) return null
  const badCitations = findUncitedInOutline(first, chunks)
  if (badCitations.length === 0) return first

  const retryPrompt = `${basePrompt}\n\nYour previous outline cited the following, which do not appear in the LEGAL CORPUS above: ${badCitations.join(', ')}. Regenerate the outline using ONLY citations that appear in the LEGAL CORPUS.`
  const retry = await callLlm(params.provider, params.apiKey, params.model, retryPrompt)
  return retry === null ? first : retry
}
