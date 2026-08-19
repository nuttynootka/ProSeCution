import { fetchSourceText, legalSourcesFor, type LegalSource } from '../legalSources'

/** Each source's fetched page is truncated to this many characters before being handed to a model — this app does real chunked, pinpoint retrieval nowhere; a fetched government page can be huge, and there's no embeddings-based passage selection (Stage 8's whole point was avoiding that infrastructure). An honest, disclosed limitation, not hidden: see the `truncated` flag on each chunk. */
export const MAX_CHUNK_CHARS = 4000

export interface RetrievedChunk {
  source: LegalSource
  text: string
  truncated: boolean
}

export interface RetrievalResult {
  chunks: RetrievedChunk[]
  unreachable: LegalSource[]
}

/**
 * Live-fetches every legal source allowlisted for a jurisdiction/case type (Chunks
 * 30-31), tolerating individual failures — the caller proceeds with whatever
 * actually succeeded, same as Agent A (Chunk 39). Shared by Agent A and Agent D
 * (Chunk 43) rather than duplicated, since both need exactly this same "fetch the
 * scoped corpus, truncate, track what failed" step before ever calling an LLM.
 */
export async function retrieveLegalChunks(jurisdiction: string, caseType: string | undefined): Promise<RetrievalResult> {
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

/** Every `[...]`-bracketed span in some model output, checked against the real source labels actually provided — the shared anti-hallucination check both Agent A's answers and Agent D's outline citations (Chunk 43) use. */
export function findUnverifiedCitations(text: string, chunks: RetrievedChunk[]): string[] {
  const knownLabels = new Set(chunks.map((c) => c.source.label))
  const found = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim())
  return [...new Set(found)].filter((ref) => !knownLabels.has(ref))
}

/** A single plain-text serialization of the retrieved corpus, for prompts whose `{{retrieved_legal_chunks}}` placeholder is a flat string rather than a `{{#each}}` loop (the drafting pipeline's prompts, Chunk 43) — distinct from Agent A's per-item loop rendering, but the same underlying chunks. */
export function serializeChunksForPrompt(chunks: RetrievedChunk[]): string {
  return chunks.map((c) => `[${c.source.label}]\n${c.text}`).join('\n\n')
}
