/**
 * `Case.state` is either a real 2-letter state code or the literal 'federal' (the
 * deadline engine's jurisdiction key, Chunk 12) — this is the one place that turns
 * the latter into a word for display instead of showing raw lowercase "federal"
 * next to uppercase state codes like "CA".
 */
export function formatJurisdiction(state: string): string {
  return state === 'federal' ? 'Federal' : state
}
