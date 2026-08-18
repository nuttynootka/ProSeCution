import type { Case, Party } from '../cases'
import { formatJurisdiction } from '../cases'

export interface CaseData {
  case: Case
  parties: Party[]
}

/**
 * Resolves a field's `suggestedGlobalKey` (Chunk 18's Template Studio) to an actual
 * value pulled from the case's own data — the "auto-populate from case data" half of
 * the blueprint's form filler. Deliberately a small, closed vocabulary matching
 * exactly what exists in the data model today (case + parties), not a speculative
 * one: adding a key here without a real field behind it would auto-fill nothing and
 * silently look like a bug rather than the honest "no data for this key" it is.
 *
 * Returns undefined for an unknown key or missing data — the caller (FillFormScreen)
 * always falls back to a manual, editable text field regardless, so a miss just
 * means an empty field to fill in by hand, the same "never fabricate, offer a manual
 * override" pattern `extractCaseNumber` (Chunk 10) and the deadline engine
 * (Chunk 12) both already follow.
 */
export function resolveGlobalKey(key: string, data: CaseData): string | undefined {
  switch (key) {
    case 'case.number':
      return data.case.caseNumber
    case 'case.county':
      return data.case.county
    case 'case.state':
      return formatJurisdiction(data.case.state)
    case 'case.type':
      return data.case.caseType
    case 'plaintiff.name':
      return data.parties.find((p) => p.role === 'plaintiff')?.name
    case 'defendant.name':
      return data.parties.find((p) => p.role === 'defendant')?.name
    default:
      return undefined
  }
}

/** The full set of keys `resolveGlobalKey` understands — lets the Template Studio field editor (Chunk 18) offer these as suggestions instead of a free-text guess at a key that will never resolve to anything. */
export const KNOWN_GLOBAL_KEYS: readonly string[] = [
  'case.number',
  'case.county',
  'case.state',
  'case.type',
  'plaintiff.name',
  'defendant.name',
]
